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
        let _ = webview.with_webview(move |platform| {
            windows_impl::apply(&platform, visible, pausable);
        });
    }
    #[cfg(not(windows))]
    {
        let _ = (webview, visible, pausable);
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
  const NativePeer = window.RTCPeerConnection;
  if (NativePeer) {
    const TrackedPeer = function (...args) {
      const pc = new NativePeer(...args);
      peers.add(pc);
      pc.addEventListener('connectionstatechange', () => {
        if (pc.connectionState === 'closed' || pc.connectionState === 'failed') peers.delete(pc);
      });
      return pc;
    };
    TrackedPeer.prototype = NativePeer.prototype;
    window.RTCPeerConnection = TrackedPeer;
  }
  const devices = navigator.mediaDevices;
  if (devices && devices.getUserMedia) {
    const getUserMedia = devices.getUserMedia.bind(devices);
    devices.getUserMedia = async (constraints) => {
      const stream = await getUserMedia(constraints);
      streams.add(stream);
      return stream;
    };
  }
  window.__opencliBusy = () => {
    for (const pc of peers) if (pc.connectionState === 'connected') return true;
    for (const stream of streams) {
      if (stream.getTracks().some((track) => track.readyState === 'live')) return true;
    }
    return Array.from(document.querySelectorAll('audio, video')).some(
      (media) => !media.paused && !media.ended && media.readyState > 2
    );
  };
})();
"#;

#[cfg(windows)]
mod windows_impl {
    use tauri::webview::PlatformWebview;
    use webview2_com::{
        Microsoft::Web::WebView2::Win32::{ICoreWebView2, ICoreWebView2_3, ICoreWebView2_8},
        ExecuteScriptCompletedHandler, TrySuspendCompletedHandler,
    };
    use windows_core::{Interface, BOOL, HSTRING};

    /// Unknown state (the init script did not run) counts as busy, so calls are never cut off.
    const BUSY_CHECK: &str =
        "(() => { try { return !window.__opencliBusy || !!window.__opencliBusy(); } catch (error) { return true; } })()";

    pub fn apply(platform: &PlatformWebview, visible: bool, pausable: bool) {
        let controller = platform.controller();
        let Ok(core) = (unsafe { controller.CoreWebView2() }) else {
            return;
        };
        if visible {
            resume(&core);
        } else if pausable {
            suspend_when_silent(core);
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

    fn suspend_when_silent(core: ICoreWebView2) {
        if is_playing_audio(&core) {
            return;
        }
        let script = HSTRING::from(BUSY_CHECK);
        let core_for_callback = core.clone();
        let handler = ExecuteScriptCompletedHandler::create(Box::new(move |_error, result| {
            if result.trim() == "false" {
                if let Ok(core3) = core_for_callback.cast::<ICoreWebView2_3>() {
                    let suspend_done = TrySuspendCompletedHandler::create(Box::new(|_, _| Ok(())));
                    let _ = unsafe { core3.TrySuspend(&suspend_done) };
                }
            }
            Ok(())
        }));
        let _ = unsafe { core.ExecuteScript(&script, &handler) };
    }
}
