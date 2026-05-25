import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Compras Vidal — Asistente de Compras IA',
  description: 'Asistente inteligente de compras industriales. Analiza materiales, busca en histórico y genera pedidos SAP.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className="dark">
      <body className="noise min-h-screen bg-[#08080f] text-white antialiased">
        {children}
      </body>
    </html>
  )
}
