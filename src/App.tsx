import { ThemeToggle } from './components/theme-toggle'

export default function App() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-end p-4 border-b border-border">
        <ThemeToggle />
      </header>
      <main className="p-8">
      </main>
    </div>
  )
}