import { useEffect } from 'react'

/**
 * Intercepts the browser back button / swipe-back gesture.
 * When the component mounts, pushes a dummy history state.
 * When back is pressed, calls onBack() instead of navigating away.
 *
 * Usage:
 *   useBackButton(() => setShowModal(false))  // in a modal
 *   useBackButton(() => setScreen('delivery')) // in a screen
 */
export function useBackButton(onBack) {
  useEffect(() => {
    // Push a state so there's something to "pop back" to
    window.history.pushState({ modal: true }, '')

    function handlePopState() {
      onBack()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      // If the component unmounts without back being pressed, clean up the state
      // by going forward (if we're still at the pushed state)
    }
  }, [])
}
