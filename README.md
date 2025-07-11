# Gupshup Chat Application

Gupshup is a modern chat application built with React, TypeScript, Vite, and Supabase. It features real-time messaging, group chats, contact management, file uploads, emoji support, and more.

## Features
- User authentication (login & signup)
- Real-time chat with typing indicators
- Group chat creation and member management
- Contact list and add contacts
- File upload and emoji picker
- Message status indicators
- User profile and notifications
- Responsive, modern UI with Tailwind CSS

## Tech Stack
- **Frontend:** React, TypeScript, Vite
- **Styling:** Tailwind CSS, PostCSS
- **Backend:** Supabase (database & authentication)
- **State Management:** React Context API

## Getting Started

### Prerequisites
- Node.js & npm
- Supabase account

### Installation
1. Clone the repository:
   ```sh
   git clone <repo-url>
   cd project
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Set up Supabase:
   - Create a project in Supabase
   - Copy your Supabase URL and anon key to `src/lib/supabase.ts`
   - Run migrations in the `supabase/migrations/` folder

4. Start the development server:
   ```sh
   npm run dev
   ```

### Build
To build for production:
```sh
npm run build
```

## Project Structure
```
project/
├── src/
│   ├── components/        # UI components (Auth, Chat, Contacts, Groups, etc.)
│   ├── contexts/          # React Contexts (AuthContext)
│   ├── lib/               # Supabase client setup
│   ├── index.css          # Global styles
│   ├── main.tsx           # App entry point
│   └── App.tsx            # Main App component
├── supabase/
│   └── migrations/        # Database migration scripts
├── index.html             # HTML template
├── package.json           # Project metadata & scripts
├── tailwind.config.js     # Tailwind CSS config
├── postcss.config.js      # PostCSS config
└── README.md              # Project documentation
```

## Author
Baseer Ahmed Tahir
