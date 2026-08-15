# Flipstackk 6.0 - Wholesaler CRM

## Overview

Flipstackk 6.0 is a wholesaler-first CRM designed for real estate investors, focusing on speed and simplicity over feature bloat. The application streamlines deal flow management, lead tracking, property analysis, and contract generation for real estate wholesaling operations.

The system is built as a full-stack TypeScript application with a React frontend and Express backend, using PostgreSQL for data persistence and shadcn/ui components for the user interface.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Application Structure

The application follows a monolithic architecture with clear separation between client and server code:

- **Client (`client/`)**: React-based SPA using Vite for development and production builds
- **Server (`server/`)**: Express.js REST API with session-based authentication
- **Shared (`shared/`)**: Common TypeScript types and database schema definitions

### Frontend Architecture

**Framework & Build System:**
- React 18 with TypeScript for type safety
- Vite as the build tool and development server
- Wouter for client-side routing (lightweight alternative to React Router)
- TanStack Query (React Query) for server state management and API data caching

**UI Component System:**
- shadcn/ui components built on Radix UI primitives
- Tailwind CSS v4 for styling with CSS variables for theming
- Custom design system using "new-york" variant with neutral base color
- Lucide icons for consistent iconography

**State Management:**
- React Context for authentication state (AuthContext)
- TanStack Query for server data fetching and caching
- No global state management library - uses composition of local state and server state

### Backend Architecture

**Core Framework:**
- Express.js for HTTP server and routing
- Node.js with ESM (ES Modules) support
- Dual entry points: `index-dev.ts` for development with Vite middleware, `index-prod.ts` for production serving

**Authentication & Sessions:**
- Session-based authentication using `express-session`
- PostgreSQL-backed session store (`connect-pg-simple`) for production-ready persistence
- Password hashing with bcrypt (12 rounds)
- Two-factor authentication support (2FA) with backup codes
- Role-based access control (admin, super admin, regular users)

**API Design:**
- RESTful endpoints organized in `routes.ts`
- Manual route registration (no auto-routing framework)
- Session data includes `userId` and `email` for authenticated requests

### Data Layer

**Database:**
- PostgreSQL as the primary database
- Drizzle ORM for type-safe database queries and migrations
- Connection via `@neondatabase/serverless` driver (supports Neon serverless Postgres)

**Schema Design:**
The database schema supports comprehensive CRM functionality:

- **Core Entities:**
  - `leads`: Lead tracking with RELAS scoring, motivation tracking, and status management
  - `properties`: Property details including beds, baths, sqft, APN, occupancy
  - `contacts`: Contact information management
  - `contracts`: Purchase agreements with amounts and status tracking
  - `offers`: Offer management with counter-offer support

- **Document Management:**
  - `contract_templates`: Reusable contract templates
  - `contract_documents`: Generated contract instances
  - `document_versions`: Version control for documents
  - `lois`: Letter of Intent management

- **User & Team Management:**
  - `users`: User accounts with profiles, roles, and company information
  - `teams`: Team/organization structure
  - `team_members`: Team membership with roles
  - `team_activity_logs`: Activity tracking and audit trails
  - `notification_preferences`: Per-user notification settings
  - `user_goals`: Goal tracking for users

- **Security:**
  - `two_factor_auth`: 2FA secrets and QR codes
  - `backup_codes`: Recovery codes for 2FA

**Data Access Pattern:**
- Repository pattern implemented in `storage.ts`
- Interface-based storage layer (`IStorage`) for potential swapping of implementations
- All database operations go through the storage layer for consistency

### Development vs Production

**Development Mode:**
- Vite dev server integrated via middleware
- HMR (Hot Module Replacement) enabled
- Development-only Replit plugins (cartographer, dev-banner, runtime error overlay)
- Source maps enabled
- Default session secret allowed (with warning)

**Production Mode:**
- Static file serving from `dist/public`
- Bundled server code via esbuild
- Requires `SESSION_SECRET` environment variable
- Optimized builds with tree-shaking

### Key Features

**Lead Management:**
- RELAS scoring integration (Real Estate Lead Assessment System)
- Multi-status pipeline (new, contacted, qualified, negotiation, closed)
- Property data enrichment
- Motivation tracking

**Contract & Document Management:**
- Contract template system
- Document version control
- Letter of Intent (LOI) generation
- Digital signature workflow

**Team Collaboration:**
- Multi-user support with role-based permissions
- Team activity logging
- Timesheet tracking
- Notification system

**Analytics & Reporting:**
- Deal pipeline visualization
- Revenue tracking
- Conversion rate analysis
- Deal calculator for profitability analysis

**User Experience:**
- Responsive design for mobile/tablet/desktop
- Real-time notifications
- Search functionality across entities
- Customizable user preferences

## External Dependencies

### Database
- **PostgreSQL**: Primary data store, accessed via Neon serverless driver
- **Drizzle ORM**: Type-safe database toolkit with schema-first approach
- **connect-pg-simple**: PostgreSQL session store for Express sessions

### Third-Party Services (Planned/Integrated)
- **RELAS API**: Proprietary lead scoring system integration (referenced in documentation)
- Property data providers integration planned (PropStream/Attom APIs mentioned but not yet implemented)

### UI Component Libraries
- **Radix UI**: Headless component primitives for accessibility
- **Recharts**: Charting library for analytics dashboards
- **shadcn/ui**: Pre-built component library built on Radix

### Development Tools
- **Vite**: Build tool and dev server
- **esbuild**: Production bundler for server code
- **TypeScript**: Type safety across the stack
- **Tailwind CSS**: Utility-first styling framework

### Authentication & Security
- **bcryptjs**: Password hashing
- **speakeasy**: Two-factor authentication (TOTP)
- **qrcode**: QR code generation for 2FA setup

### Replit Integration
- Custom Vite plugins for Replit-specific features (meta images, cartographer, dev banner)
- Environment-aware deployment URL handling