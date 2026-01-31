import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
})

export const metadata: Metadata = {
  metadataBase: new URL('https://fit-dash-psi.vercel.app'),
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
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
