import type { Metadata } from 'next'
import { Space_Grotesk, Space_Mono } from 'next/font/google'
import './globals.css'

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['300', '400', '500', '700'],
  variable: '--font-grotesk',
  display: 'swap',
})

const spaceMono = Space_Mono({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-mono',
  display: 'swap',
})

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
    <html lang="en" className={`dark ${spaceGrotesk.variable} ${spaceMono.variable}`}>
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
