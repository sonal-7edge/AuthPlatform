/**
 * Centred card wrapper shared by every auth screen.
 *
 * `.ac-root` is the scope for the library's reset and font tokens — it must
 * stay on the outermost element of any screen rendered outside AuthCard too.
 *
 * @param {{
 *   title: string,
 *   subtitle?: string,
 *   footer?: React.ReactNode,
 *   children: React.ReactNode,
 * }} props
 */
export default function AuthCard({ title, subtitle, footer, children }) {
  return (
    <div className="ac-root min-h-screen w-full flex items-center justify-center bg-ac-bg px-4 py-10">
      <div className="w-full max-w-[26rem]">
        <div className="bg-ac-surface border border-ac-border rounded-ac-lg shadow-sm px-7 py-8">
          <header className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight text-ac-fg">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-ac-muted">{subtitle}</p>}
          </header>
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-sm text-ac-muted">{footer}</div>}
      </div>
    </div>
  )
}
