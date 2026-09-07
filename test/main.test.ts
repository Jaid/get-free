import type {Occupations, Options} from '#src/main.ts'

import {describe, expect, expectTypeOf, test} from 'bun:test'

import getFree from '#src/main.ts'

function *occupiedIds() {
  yield 'log_2'
  yield 'log'
}
async function *asyncOccupiedIds() {
  yield 'log_2'
  await Promise.resolve()
  yield 'log'
}
const mixedPredicate: Occupations = id => {
  return id === 'log' ? true : Promise.resolve(false)
}
const getFreeThroughGeneric = <T extends Occupations>(occupations: T) => getFree('log', occupations)
describe('getFree', () => {
  test('returns the bare base when it is free', async () => {
    expect(await getFree('log', [])).toBe('log')
  })
  test('counts the bare base as the start number', async () => {
    expect(await getFree('log', ['log', 'log_2'])).toBe('log_3')
  })
  test('returns the first gap instead of the largest suffix plus one', async () => {
    expect(await getFree('log', ['log_4', 'log', 'log_2', 'log_2'])).toBe('log_3')
  })
  test('matches complete IDs case-sensitively', async () => {
    expect(await getFree('log', ['LOG', 'log_1', 'log_02', 'prefix_log'])).toBe('log')
  })
  test('accepts sets without modifying them', async () => {
    const occupied = new Set(['log', 'log_2'])
    expect(await getFree('log', occupied)).toBe('log_3')
    expect([...occupied]).toEqual(['log', 'log_2'])
  })
  test('collects a single-use iterable once before checking candidates', async () => {
    expect(await getFree('log', occupiedIds())).toBe('log_3')
  })
  test('collects an async iterable once before checking candidates', async () => {
    expect(await getFree('log', asyncOccupiedIds())).toBe('log_3')
  })
  test('supports synchronous predicates and stops at the first free ID', async () => {
    const candidates: Array<string> = []
    const occupations = (id: string) => {
      candidates.push(id)
      return id !== 'log_3'
    }
    expect(await getFree('log', occupations)).toBe('log_3')
    expect(candidates).toEqual(['log', 'log_2', 'log_3'])
  })
  test('awaits asynchronous predicates sequentially', async () => {
    const candidates: Array<string> = []
    let checking = false
    const occupations = async (id: string) => {
      expect(checking).toBe(false)
      checking = true
      candidates.push(id)
      await Bun.sleep(1)
      checking = false
      return id !== 'log_3'
    }
    expect(await getFree('log', occupations)).toBe('log_3')
    expect(candidates).toEqual(['log', 'log_2', 'log_3'])
  })
  test('supports predicates returning a mix of booleans and promises', async () => {
    expect(await getFree('log', mixedPredicate)).toBe('log_2')
  })
  test.each([
    [{consistent: true}, [], 'log_1'],
    [{consistent: true}, ['log_1', 'log_2'], 'log_3'],
    [{start: 5}, [], 'log'],
    [{start: 5}, ['log', 'log_6'], 'log_7'],
    [
      {
        start: 5,
        consistent: true,
      }, [], 'log_5',
    ],
    [{start: 0}, ['log'], 'log_1'],
    [
      {
        start: 0,
        consistent: true,
      }, [], 'log_0',
    ],
    [{connector: '-'}, ['log', 'log-2'], 'log-3'],
    [{connector: ''}, ['log', 'log2'], 'log3'],
    [{pad: 3}, ['log', 'log_002'], 'log_003'],
    [
      {
        pad: 2,
        start: 99,
        consistent: true,
      }, ['log_99'], 'log_100',
    ],
    [
      {
        connector: ' → ',
        consistent: true,
        pad: 3,
        start: 7,
      }, ['log → 007'], 'log → 008',
    ],
  ] satisfies Array<[Options, Array<string>, string]>)('applies options %j', async (options, occupations, expected) => {
    expect(await getFree('log', occupations, options)).toBe(expected)
  })
  test('supports empty and Unicode bases', async () => {
    expect(await getFree('', [])).toBe('')
    expect(await getFree('', [''])).toBe('_2')
    expect(await getFree('猫', ['猫'])).toBe('猫_2')
  })
  test('uses defaults for explicitly undefined options', async () => {
    expect(await getFree('log', ['log'], {
      connector: undefined,
      consistent: undefined,
      pad: undefined,
      start: undefined,
    })).toBe('log_2')
  })
  test.each([-1, 0.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid start %s before checking occupations', async start => {
    let checked = false
    expect(() => getFree('log', () => {
      checked = true
      return false
    }, {start})).toThrow(RangeError)
    expect(checked).toBe(false)
  })
  test.each([0, -1, 1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid pad %s', async pad => {
    expect(() => getFree('log', [], {pad})).toThrow(RangeError)
  })
  test('can return the largest safe suffix', async () => {
    expect(await getFree('log', [], {
      start: Number.MAX_SAFE_INTEGER,
      consistent: true,
    })).toBe(`log_${Number.MAX_SAFE_INTEGER}`)
    expect(await getFree('log', id => id === 'log', {start: Number.MAX_SAFE_INTEGER - 1})).toBe(`log_${Number.MAX_SAFE_INTEGER}`)
  })
  test.each([false, true])('rejects exhausted safe integers with consistent=%s', async consistent => {
    expect(() => getFree('log', () => true, {
      start: Number.MAX_SAFE_INTEGER,
      consistent,
    })).toThrow(RangeError)
  })
  test('propagates synchronous predicate errors', async () => {
    const error = new Error('Cannot check occupation.')
    expect(() => getFree('log', () => {
      throw error
    })).toThrow(error)
  })
  test('propagates asynchronous predicate errors', async () => {
    const error = new Error('Cannot check occupation.')
    await expect(getFree('log', () => Promise.reject(error))).rejects.toBe(error)
  })
  test('propagates iterable errors', async () => {
    const error = new Error('Cannot list occupations.')
    function *occupations() {
      yield 'log'
      throw error
    }
    expect(() => getFree('log', occupations())).toThrow(error)
  })
  test('propagates async iterable errors', async () => {
    const error = new Error('Cannot list occupations.')
    async function *occupations() {
      yield 'log'
      throw error
    }
    await expect(getFree('log', occupations())).rejects.toBe(error)
  })
})
describe('return types', () => {
  test('returns and infers strings for synchronous sources', () => {
    const predicateResult = getFree('log', id => id === 'log')
    const arrayResult = getFree('log', ['log'])
    const setResult = getFree('log', new Set(['log']))
    const iteratorResult = getFree('log', occupiedIds())
    expectTypeOf(predicateResult).toEqualTypeOf<string>()
    expectTypeOf(arrayResult).toEqualTypeOf<string>()
    expectTypeOf(setResult).toEqualTypeOf<string>()
    expectTypeOf(iteratorResult).toEqualTypeOf<string>()
    expect(predicateResult).toBe('log_2')
    expect(arrayResult).toBe('log_2')
    expect(setResult).toBe('log_2')
    expect(iteratorResult).toBe('log_3')
  })
  test('returns and infers promises for asynchronous sources', async () => {
    const predicateResult = getFree('log', id => Promise.resolve(id === 'log'))
    const iteratorResult = getFree('log', asyncOccupiedIds())
    expectTypeOf(predicateResult).toEqualTypeOf<Promise<string>>()
    expectTypeOf(iteratorResult).toEqualTypeOf<Promise<string>>()
    expect(predicateResult).toBeInstanceOf(Promise)
    expect(iteratorResult).toBeInstanceOf(Promise)
    expect(await predicateResult).toBe('log_2')
    expect(await iteratorResult).toBe('log_3')
  })
  test('infers a union for mixed testers and stays synchronous until necessary', async () => {
    const syncResult = getFree('other', mixedPredicate)
    const result = getFree('log', mixedPredicate)
    expectTypeOf(result).toEqualTypeOf<Promise<string> | string>()
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBe('log_2')
    expect(await syncResult).toBe('other')
    const immediatelyFree = getFree('log_2', id => {
      return id === 'log_2' ? false : Promise.resolve(true)
    })
    expectTypeOf(immediatelyFree).toEqualTypeOf<Promise<string> | string>()
    expect(immediatelyFree).toBe('log_2')
  })
  test('supports promise-like results without requiring native promises', async () => {
    const result = getFree('log', (id): PromiseLike<boolean> => ({
      // eslint-disable-next-line unicorn/no-thenable, promise/prefer-await-to-then -- Verify support for non-native promise-like testers.
      then: (resolve, reject) => Promise.resolve(id === 'log').then(resolve, reject),
    }))
    expectTypeOf(result).toEqualTypeOf<Promise<string>>()
    expect(await result).toBe('log_2')
  })
  test('does not repeat or skip candidates when switching to asynchronous checking', async () => {
    const candidates: Array<string> = []
    const result = getFree('log', id => {
      candidates.push(id)
      if (id === 'log_2') {
        return Promise.resolve(true)
      }
      return id !== 'log_4'
    })
    expect(await result).toBe('log_4')
    expect(candidates).toEqual(['log', 'log_2', 'log_3', 'log_4'])
  })
  test('rejects errors thrown after the first asynchronous check', async () => {
    const error = new Error('Cannot check occupation.')
    const result = getFree('log', id => {
      if (id === 'log') {
        return Promise.resolve(true)
      }
      throw error
    })
    await expect(result).rejects.toBe(error)
  })
  test('rejects asynchronous exhaustion of the safe integer range', async () => {
    await expect(getFree('log', () => Promise.resolve(true), {start: Number.MAX_SAFE_INTEGER})).rejects.toThrow(RangeError)
  })
})
describe('maximum', () => {
  test.each([false, true])('checks the inclusive maximum with consistent=%s', consistent => {
    const candidates: Array<string> = []
    const result = getFree('log', id => {
      candidates.push(id)
      return id !== 'log_3'
    }, {
      consistent,
      maximum: 3,
    })
    expectTypeOf(result).toEqualTypeOf<string>()
    expect(result).toBe('log_3')
    expect(candidates).toEqual([consistent ? 'log_1' : 'log', 'log_2', 'log_3'])
  })
  test.each([false, true])('never checks beyond maximum with consistent=%s', consistent => {
    const candidates: Array<string> = []
    expect(() => getFree('log', id => {
      candidates.push(id)
      return true
    }, {
      consistent,
      maximum: 2,
    })).toThrow(RangeError)
    expect(candidates).toEqual([consistent ? 'log_1' : 'log', 'log_2'])
  })
  test.each([false, true])('permits a single candidate when start equals maximum with consistent=%s', consistent => {
    const options = {
      consistent,
      start: 0,
      maximum: 0,
    }
    expect(getFree('log', [], options)).toBe(consistent ? 'log_0' : 'log')
    expect(() => getFree('log', () => true, options)).toThrow(RangeError)
  })
  test('supports custom start, padding and connector', () => {
    expect(getFree('log', ['log-007'], {
      connector: '-',
      consistent: true,
      start: 7,
      pad: 3,
      maximum: 8,
    })).toBe('log-008')
  })
  test('checks the inclusive maximum asynchronously', async () => {
    const result = getFree('log', id => Promise.resolve(id !== 'log_2'), {maximum: 2})
    expectTypeOf(result).toEqualTypeOf<Promise<string>>()
    expect(await result).toBe('log_2')
  })
  test('rejects without testing beyond maximum asynchronously', async () => {
    const candidates: Array<string> = []
    await expect(getFree('log', id => {
      candidates.push(id)
      return Promise.resolve(true)
    }, {maximum: 2})).rejects.toThrow(RangeError)
    expect(candidates).toEqual(['log', 'log_2'])
  })
  test('enforces maximum after switching from sync to async', async () => {
    const candidates: Array<string> = []
    await expect(getFree('log', id => {
      candidates.push(id)
      return id === 'log' ? true : Promise.resolve(true)
    }, {maximum: 2})).rejects.toThrow(RangeError)
    expect(candidates).toEqual(['log', 'log_2'])
  })
  test('enforces maximum for synchronous and asynchronous iterables', async () => {
    expect(getFree('log', occupiedIds(), {maximum: 3})).toBe('log_3')
    expect(() => getFree('log', occupiedIds(), {maximum: 2})).toThrow(RangeError)
    expect(await getFree('log', asyncOccupiedIds(), {maximum: 3})).toBe('log_3')
    await expect(getFree('log', asyncOccupiedIds(), {maximum: 2})).rejects.toThrow(RangeError)
  })
  test.each([-1, 0, 1.5, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid maximum %s before checking occupations', maximum => {
    let checked = false
    expect(() => getFree('log', () => {
      checked = true
      return false
    }, {maximum})).toThrow(RangeError)
    expect(checked).toBe(false)
  })
  test('rejects maximum below a custom start even when the base is free', () => {
    expect(() => getFree('log', [], {
      start: 5,
      maximum: 4,
    })).toThrow(RangeError)
  })
  test('uses the default maximum when explicitly undefined', () => {
    expect(getFree('log', ['log'], {maximum: undefined})).toBe('log_2')
  })
})
describe('precise overloads', () => {
  test.each([false, true])('infers string for unions of synchronous sources with predicate=%s', usePredicate => {
    const occupations = usePredicate ? (id: string) => id === 'log' : ['log']
    const result = getFree('log', occupations)
    expectTypeOf(result).toEqualTypeOf<string>()
    expect(result).toBe('log_2')
  })
  test.each([false, true])('infers Promise for unions of asynchronous sources with predicate=%s', usePredicate => {
    const occupations = usePredicate ? (id: string) => Promise.resolve(id !== 'log_3') : asyncOccupiedIds()
    const result = getFree('log', occupations)
    expectTypeOf(result).toEqualTypeOf<Promise<string>>()
    return expect(result).resolves.toBe('log_3')
  })
  test('preserves input-dependent results through a generic wrapper', async () => {
    const syncResult = getFreeThroughGeneric(['log'])
    const asyncResult = getFreeThroughGeneric(asyncOccupiedIds())
    const mixedResult = getFreeThroughGeneric(mixedPredicate)
    expectTypeOf(syncResult).toEqualTypeOf<string>()
    expectTypeOf(asyncResult).toEqualTypeOf<Promise<string>>()
    expectTypeOf(mixedResult).toEqualTypeOf<Promise<string> | string>()
    expect(syncResult).toBe('log_2')
    expect(await asyncResult).toBe('log_3')
    expect(await mixedResult).toBe('log_2')
  })
  test.each([false, true])('keeps the necessary union for mixed source types with async=%s', useAsync => {
    const occupations = useAsync ? asyncOccupiedIds() : ['log', 'log_2']
    const result = getFree('log', occupations)
    expectTypeOf(result).toEqualTypeOf<Promise<string> | string>()
    return expect(Promise.resolve(result)).resolves.toBe('log_3')
  })
  test('prefers asynchronous iteration for dual-protocol iterables', async () => {
    const occupations = {
      [Symbol.iterator]: occupiedIds,
      [Symbol.asyncIterator]: asyncOccupiedIds,
    }
    const result = getFree('log', occupations)
    const genericResult = getFreeThroughGeneric(occupations)
    expectTypeOf(result).toEqualTypeOf<Promise<string>>()
    expectTypeOf(genericResult).toEqualTypeOf<Promise<string>>()
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBe('log_3')
    expect(await genericResult).toBe('log_3')
  })
})
