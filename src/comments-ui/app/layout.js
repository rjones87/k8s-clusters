import "./globals.css";

export const metadata = {
  title: "Comments UI",
  description: "CRUD client for the comments service"
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
