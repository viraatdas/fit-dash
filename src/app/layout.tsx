import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL('https://fitdash.viraat.dev'),
  title: 'Fitness Dashboard',
  description: 'Track your workouts, analyze strength progress, and monitor body composition. Powered by Notion.',
  keywords: ['fitness', 'workout tracker', 'strength training', 'body composition', 'inbody'],
  authors: [{ name: 'Viraat Das' }],
  openGraph: {
    title: 'Fitness Dashboard',
    description: 'Track your workouts, analyze strength progress, and monitor body composition.',
    type: 'website',
    locale: 'en_US',
    siteName: 'Fitness Dashboard',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Fitness Dashboard',
    description: 'Track your workouts, analyze strength progress, and monitor body composition.',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            try {
              if (localStorage.getItem('theme') === 'light') {
                document.documentElement.classList.remove('dark');
              }
            } catch(e) {}
          `
        }} />
      </head>
      <body className="font-grotesk">{children}</body>
    </html>
  )
}
