//! Pauses hidden tab webviews with WebView2's `TrySuspend` and resumes them when shown.
//!
//! A webview is kept running when it is playing audio, when a call is active
//! (WebRTC connection or live microphone/camera stream), or when an agent is
//! driving it through the browser bridge. Other platforms keep the default
//! behaviour, so this module is a no-op there.

use tauri::Webview;

/// Resumes a visible webview, or suspends a hidden one when it is safe to do so.
/// `pausable` is false for tabs an agent is currently controlling.
pub fn apply(webview: &Webview, visible: bool, pausable: bool) {
    #[cfg(windows)]
    {
        let label = webview.label().to_string();
        let generation = windows_impl::next_generation(&label, visible);
        let _ = webview.with_webview(move |platform| {
            windows_impl::apply(&platform, &label, generation, visible, pausable);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (webview, visible, pausable);
    }
}

/// Drops per-tab state kept for suspend generation tracking.
pub fn forget(label: &str) {
    #[cfg(windows)]
    windows_impl::forget(label);
    #[cfg(not(windows))]
    let _ = label;
}

/// Captures the current frame of a tab webview as a JPEG data URL.
/// Used to keep a still image in the DOM while the native webview is hidden
/// behind a modal or tooltip, so that area never flashes blank.
pub fn capture_png(webview: &Webview) -> Option<String> {
    #[cfg(windows)]
    {
        let (sender, receiver) = std::sync::mpsc::channel();
        let _ = webview.with_webview(move |platform| {
            let _ = sender.send(windows_impl::capture_png(&platform));
        });
        receiver
            .recv_timeout(std::time::Duration::from_secs(2))
            .ok()
            .flatten()
    }
    #[cfg(not(windows))]
    {
        let _ = webview;
        None
    }
}

/// Injected into every tab webview before the page scripts run.
/// Tracks WebRTC peer connections, live capture streams and media elements,
/// and exposes `window.__opencliBusy()` for the native side to query.
pub const POWER_INIT_SCRIPT: &str = r#"
(() => {
  if (window.__opencliBusy) return;
  const peers = new Set();
  const streams = new Set();
  window.__opencliBusy = () => {
    try {
      for (const pc of peers) {
        if (pc.connectionState === 'connected') return true;
      }
      for (const stream of streams) {
        if (stream.getTracks().some((track) => track.readyState === 'live')) return true;
      }
      return Array.from(document.querySelectorAll('audio, video')).some(
        (media) => !media.paused && !media.ended && media.readyState > 2
      );
    } catch (error) {
      return true;
    }
  };
  try {
    const NativePeer = window.RTCPeerConnection || window.webkitRTCPeerConnection;
    if (NativePeer) {
      const TrackedPeer = function (...args) {
        const pc = new NativePeer(...args);
        peers.add(pc);
        try {
          pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'closed' || pc.connectionState === 'failed') {
              peers.delete(pc);
            }
          });
        } catch (error) {}
        return pc;
      };
      TrackedPeer.prototype = NativePeer.prototype;
      for (const key of Object.getOwnPropertyNames(NativePeer)) {
        if (key === 'prototype' || key === 'length' || key === 'name' || key in TrackedPeer) {
          continue;
        }
        try {
          const descriptor = Object.getOwnPropertyDescriptor(NativePeer, key);
          if (!descriptor) continue;
          if (typeof descriptor.value === 'function') {
            descriptor.value = descriptor.value.bind(NativePeer);
          }
          Object.defineProperty(TrackedPeer, key, descriptor);
        } catch (error) {}
      }
      window.RTCPeerConnection = TrackedPeer;
      if (window.webkitRTCPeerConnection) window.webkitRTCPeerConnection = TrackedPeer;
    }
  } catch (error) {}
  try {
    const devices = navigator.mediaDevices;
    if (devices) {
      for (const name of ['getUserMedia', 'getDisplayMedia']) {
        const original = devices[name];
        if (typeof original !== 'function') continue;
        const bound = original.bind(devices);
        try {
          devices[name] = async (constraints) => {
            const stream = await bound(constraints);
            streams.add(stream);
            return stream;
          };
        } catch (error) {}
      }
    }
  } catch (error) {}
})();
"#;

#[cfg(windows)]
mod windows_impl {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};
    use tauri::webview::PlatformWebview;
    use webview2_com::{
        CapturePreviewCompletedHandler, ExecuteScriptCompletedHandler,
        Microsoft::Web::WebView2::Win32::{
            ICoreWebView2, ICoreWebView2_3, ICoreWebView2_8,
            COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_JPEG,
        },
        TrySuspendCompletedHandler,
    };
    use windows::Win32::Foundation::HGLOBAL;
    use windows::Win32::System::Com::{
        StructuredStorage::{CreateStreamOnHGlobal, GetHGlobalFromStream},
        STREAM_SEEK_END, STREAM_SEEK_SET,
    };
    use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
    use windows_core::{Interface, BOOL, HSTRING};

    /// Unknown state (the init script did not run) counts as busy, so calls are never cut off.
    const BUSY_CHECK: &str =
        "(() => { try { return !window.__opencliBusy || !!window.__opencliBusy(); } catch (error) { return true; } })()";

    static GENERATIONS: OnceLock<Mutex<HashMap<String, (u64, bool)>>> = OnceLock::new();

    fn generations() -> &'static Mutex<HashMap<String, (u64, bool)>> {
        GENERATIONS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    pub(super) fn next_generation(label: &str, visible: bool) -> u64 {
        let mut map = generations().lock().unwrap();
        let entry = map.entry(label.to_string()).or_insert((0, false));
        entry.0 = entry.0.wrapping_add(1);
        entry.1 = visible;
        entry.0
    }

    fn is_current(label: &str, generation: u64) -> bool {
        generations()
            .lock()
            .ok()
            .and_then(|map| map.get(label).copied())
            .map(|(current, visible)| current == generation && !visible)
            .unwrap_or(false)
    }

    pub(super) fn forget(label: &str) {
        if let Ok(mut map) = generations().lock() {
            map.remove(label);
        }
    }

    pub fn apply(
        platform: &PlatformWebview,
        label: &str,
        generation: u64,
        visible: bool,
        pausable: bool,
    ) {
        let controller = platform.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            return;
        };
        if visible {
            resume(&core);
        } else if pausable {
            suspend_when_silent(core, label.to_string(), generation);
        }
    }

    fn resume(core: &ICoreWebView2) {
        if let Ok(core3) = core.cast::<ICoreWebView2_3>() {
            let _ = unsafe { core3.Resume() };
        }
    }

    fn is_playing_audio(core: &ICoreWebView2) -> bool {
        let Ok(core8) = core.cast::<ICoreWebView2_8>() else {
            return false;
        };
        let mut playing = BOOL::default();
        unsafe { core8.IsDocumentPlayingAudio(&mut playing) }.is_ok() && playing.as_bool()
    }

    pub fn capture_png(platform: &PlatformWebview) -> Option<String> {
        use base64::Engine;

        let controller = platform.controller();
        let core = unsafe { controller.CoreWebView2() }.ok()?;
        let stream = unsafe { CreateStreamOnHGlobal(HGLOBAL(std::ptr::null_mut()), true) }.ok()?;
        let (sender, receiver) = std::sync::mpsc::channel();
        let handler = CapturePreviewCompletedHandler::create(Box::new(move |result| {
            let _ = sender.send(result.is_ok());
            Ok(())
        }));
        unsafe {
            core.CapturePreview(
                COREWEBVIEW2_CAPTURE_PREVIEW_IMAGE_FORMAT_JPEG,
                &stream,
                &handler,
            )
        }
        .ok()?;
        if !receiver
            .recv_timeout(std::time::Duration::from_secs(2))
            .unwrap_or(false)
        {
            return None;
        }

        let mut length = 0u64;
        unsafe { stream.Seek(0, STREAM_SEEK_END, Some(&mut length)) }.ok()?;
        if length == 0 || length > usize::MAX as u64 {
            return None;
        }
        unsafe { stream.Seek(0, STREAM_SEEK_SET, None) }.ok()?;

        let hglobal = unsafe { GetHGlobalFromStream(&stream) }.ok()?;
        let pointer = unsafe { GlobalLock(hglobal) };
        if pointer.is_null() {
            return None;
        }
        let bytes =
            unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), length as usize) }.to_vec();
        let _ = unsafe { GlobalUnlock(hglobal) };

        Some(format!(
            "data:image/jpeg;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        ))
    }

    fn suspend_when_silent(core: ICoreWebView2, label: String, generation: u64) {
        if is_playing_audio(&core) {
            return;
        }
        let script = HSTRING::from(BUSY_CHECK);
        let core_for_callback = core.clone();
        let handler = ExecuteScriptCompletedHandler::create(Box::new(move |_error, result| {
            if result.trim() == "false" && is_current(&label, generation) {
                if let Ok(core3) = core_for_callback.cast::<ICoreWebView2_3>() {
                    let core_for_done = core_for_callback.clone();
                    let label_for_done = label.clone();
                    let suspend_done = TrySuspendCompletedHandler::create(Box::new(move |_, _| {
                        if !is_current(&label_for_done, generation) {
                            resume(&core_for_done);
                        }
                        Ok(())
                    }));
                    let _ = unsafe { core3.TrySuspend(&suspend_done) };
                }
            }
            Ok(())
        }));
        let _ = unsafe { core.ExecuteScript(&script, &handler) };
    }
}
