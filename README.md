# Open-CLI

A modern admin dashboard built with React 19, TypeScript, TanStack Router, and TailwindCSS v4. Features a Tauri desktop app with embedded terminal.

![Open-CLI Dashboard](public/images/shadcn-admin.png)

## Features

- **Authentication**: Email/password with Clerk integration (optional)
- **Desktop App**: Tauri v2 with native terminal (PTY), embedded browser, window controls
- **Dashboard**: Users, Tasks, Settings (Profile, Account, Appearance, Notifications, Display)
- **Global Search**: Command palette with keyboard shortcuts (⌘K / Ctrl+K)
- **Theming**: Light/Dark/System with persistence
- **Layout**: Configurable sidebar (inset/floating/sidebar), collapsible states
- **RTL Support**: Full right-to-left language support
- **Accessibility**: ARIA attributes, keyboard navigation, screen reader announcements
- **Internationalization**: Font selection, direction (LTR/RTL)

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI | React 19, TailwindCSS v4, Radix UI |
| Routing | TanStack Router (file-based) |
| State | Zustand, TanStack Query |
| Desktop | Tauri v2 (Rust) |
| Build | Vite 6, TypeScript 6 |
| Testing | Vitest + Playwright (browser) |
| Linting | ESLint 10, Prettier |

## Project Structure

```
src/
├── components/
│   ├── ui/           # Radix UI wrappers (27 components)
│   ├── layout/       # Header, Sidebar, Main, AuthenticatedHeader
│   └── data-table/   # Table toolbar, pagination, bulk actions
├── context/          # Theme, Layout, Font, Direction, Search providers
├── features/
│   ├── auth/         # Sign-in, Sign-up, OTP, Forgot password
│   ├── users/        # User management with table, dialogs
│   ├── tasks/        # Task management with table, dialogs
│   ├── settings/     # Profile, Account, Appearance, Notifications, Display
│   ├── terminal/     # Multi-tab PTY terminal (desktop only)
│   ├── chats/        # Chat interface
│   └── errors/       # Error boundaries (401, 403, 404, 500, 503)
├── hooks/            # useTableUrlState, useMobile, useDialogState
├── lib/              # Utilities, cookies, platform detection, PTY, browser
├── routes/           # File-based routes (TanStack Router)
├── stores/           # Zustand stores (auth)
└── styles/           # Global CSS, theme variables
```

## Run Locally

### Prerequisites

- Node.js 22+
- pnpm 10+
- Rust 1.80+ (for Tauri desktop)

### Web Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm run dev
```

### Desktop Development

```bash
#setup environtment
$env:Path = "$env:USERPROFILE\.cargo\bin;$env:Path"

# Start Tauri dev (includes web dev server)
pnpm run desktop:dev

# Build desktop app
pnpm run desktop:build
```

### Testing

```bash
# Run tests headless
pnpm run test

# Run tests with UI
pnpm run test:ui

# Run tests with coverage
pnpm run test:coverage
```

### Linting & Formatting

```bash
# Check formatting
pnpm run format:check

# Format code
pnpm run format

# Lint
pnpm run lint

# Type check
pnpm run build  # includes tsc -b
```

## Desktop Features (Tauri)

- **Terminal**: Multi-tab PTY terminal with grid layout, drag-to-resize panes
- **Embedded Browser**: Open URLs in native webview with custom bounds
- **Window Controls**: Minimize, maximize, close with drag region
- **System Theme**: Syncs with OS dark/light mode

## Configuration

### Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

| Variable | Description |
|----------|-------------|
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk authentication (optional) |

### Clerk Authentication (Optional)

The `/clerk` routes provide a complete Clerk integration. To enable:

1. Create a Clerk application at [clerk.com](https://clerk.com)
2. Add `VITE_CLERK_PUBLISHABLE_KEY` to `.env`
3. Navigate to `/clerk` to use Clerk auth

Without the key, the Clerk routes show setup instructions. The main app uses a simple mock auth at `/sign-in`.

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm run dev` | Start web dev server |
| `pnpm run desktop:dev` | Start Tauri dev |
| `pnpm run desktop:build` | Build desktop app |
| `pnpm run build` | Type check + Vite build |
| `pnpm run lint` | ESLint |
| `pnpm run format` | Prettier write |
| `pnpm run format:check` | Prettier check |
| `pnpm run test` | Vitest headless |
| `pnpm run test:ui` | Vitest UI |
| `pnpm run test:coverage` | Coverage report |
| `pnpm run knip` | Find unused files/exports |

## License

MIT License - see [LICENSE](LICENSE) for details.

## Credits

Built with [shadcn/ui](https://ui.shadcn.com), [TanStack](https://tanstack.com), [Tauri](https://tauri.app), [Radix UI](https://radix-ui.com), [TailwindCSS](https://tailwindcss.com), [Lucide Icons](https://lucide.dev).