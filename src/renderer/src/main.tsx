import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono'
import '@fontsource-variable/space-grotesk'
import './styles.css'

// One bundle, two windows: the menu bar popover loads index.html#popover.
const isPopover = location.hash === '#popover'
const Root = isPopover ? lazy(() => import('./popover/TrayPopover')) : lazy(() => import('./App'))
if (isPopover) document.documentElement.classList.add('popover')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>
      <Root />
    </Suspense>
  </StrictMode>
)
