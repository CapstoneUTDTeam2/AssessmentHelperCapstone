import { describe, expect, it } from 'vitest'
import { matchesSearch } from '../search'

describe('matchesSearch', () => {
  it('matches everything for an empty query', () => {
    expect(matchesSearch('  ', ['Alice Johnson'])).toBe(true)
  })

  it('matches one letter only at the start of a word', () => {
    expect(matchesSearch('a', ['Alice Johnson'])).toBe(true)
    expect(matchesSearch('j', ['Alice Johnson'])).toBe(true)
    expect(matchesSearch('e', ['Alice Johnson', 'alice@utdallas.edu'.replace(/@.*/, '')])).toBe(false)
    expect(matchesSearch('e', ['Robert Smith', 'Lecturer'])).toBe(false)
  })

  it('ignores case and needs every word to match', () => {
    expect(matchesSearch('ALICE jo', ['Alice Johnson'])).toBe(true)
    expect(matchesSearch('alice smith', ['Alice Johnson'])).toBe(false)
  })

  it('finds course codes with or without the space', () => {
    expect(matchesSearch('cs 6301', ['CS 6301'])).toBe(true)
    expect(matchesSearch('cs6301', ['CS 6301'])).toBe(true)
    expect(matchesSearch('6301', ['CS 6301'])).toBe(true)
    expect(matchesSearch('8v0', ['CS 8V02'])).toBe(true)
  })

  it('finds longer terms inside a word', () => {
    expect(matchesSearch('pile', ['Compiler Design'])).toBe(true)
    expect(matchesSearch('pi', ['Compiler Design'])).toBe(false)
  })

  it('skips empty fields', () => {
    expect(matchesSearch('alice', [null, undefined, '', 'Alice'])).toBe(true)
  })
})
