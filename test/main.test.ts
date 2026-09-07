import {expect, test} from 'bun:test'

const {default: getFree} = await import('#src/main.ts')

test('should run', () => {
  const result = getFree()
  expect(result).toBe('get-free') // TODO Test actual functionality
})
