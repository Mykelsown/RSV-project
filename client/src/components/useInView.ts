import { useEffect, useRef, useState } from 'react'

type UseInViewOptions = {
  threshold?: number
  rootMargin?: string
  /** When false, the flag toggles back as the element leaves view. */
  once?: boolean
}

/** Scroll-in reveal hook shared by the landing sections and dashboard preview. */
export function useInView<T extends HTMLElement>({ threshold = 0.18, rootMargin, once = true }: UseInViewOptions = {}) {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setInView(true)
            if (once) observer.disconnect()
          } else if (!once) {
            setInView(false)
          }
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [threshold, rootMargin, once])

  return { ref, inView }
}
