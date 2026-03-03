import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn (className utility)', () => {
  it('merges simple class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('base', true && 'active', false && 'hidden')).toBe('base active')
  })

  it('handles undefined and null values', () => {
    expect(cn('base', undefined, null)).toBe('base')
  })

  it('handles empty string', () => {
    expect(cn('')).toBe('')
  })

  it('merges Tailwind classes correctly (twMerge)', () => {
    // twMerge should resolve conflicting Tailwind classes
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('handles arrays via clsx', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('handles objects via clsx', () => {
    expect(cn({ 'text-bold': true, 'text-italic': false })).toBe('text-bold')
  })

  it('returns empty string for no arguments', () => {
    expect(cn()).toBe('')
  })
})
