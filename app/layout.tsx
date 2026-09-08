import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'ENDGAME / 終盤道場',
  description: '勝ちをつかむ。引き分けを保つ。終盤テーブルベースで学ぶチェストレーニング。',
  metadataBase: new URL('https://endgame-dojo.wise-harp-1988.chatgpt.site'),
  icons: { icon: '/icon.png' },
  openGraph: { title: 'ENDGAME / 終盤道場', description: '最後の一手まで、最善を。少数駒の終盤で、勝ちと引き分けを練習しよう。', images: ['/og.png'], locale: 'ja_JP', type: 'website' },
  twitter: { card: 'summary_large_image', title: 'ENDGAME / 終盤道場', description: '最後の一手まで、最善を。', images: ['/og.png'] },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
