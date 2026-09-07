# get-free

Find the first unoccupied string ID by appending an incrementing numeric suffix.

## Installation

```sh
bun add get-free
```

## Usage

```ts
import getFree from 'get-free'

getFree('log', []) // 'log'
getFree('log', ['log', 'log_2']) // 'log_3'
getFree('log', new Set(['log_1']), {consistent: true}) // 'log_2'
getFree('log', ['log-007'], {
  connector: '-',
  consistent: true,
  pad: 3,
  start: 7,
}) // 'log-008'
```

Synchronous predicates and iterables return a plain `string`. Asynchronous predicates and iterables return a `Promise<string>`. TypeScript infers the corresponding return type. A predicate typed to return either a boolean or a promise-like boolean produces `string | Promise<string>`: execution stays synchronous until a promise-like result is encountered, then remains asynchronous. Occupations may be a finite synchronous or asynchronous iterable of strings, or a predicate returning a boolean or a promise-like boolean. A predicate returns `true` when the candidate is **occupied**.

```ts
const occupied = new Set(['log', 'log_2'])
getFree('log', id => occupied.has(id)) // 'log_3'

// Check an external resource asynchronously.
await getFree('log', async id => Bun.file(`logs/${id}.txt`).exists())
```

Iterable sources are fully collected into a set once, so input order and duplicate entries do not matter. Predicates are called sequentially, once per candidate, until one returns `false`. IDs are compared exactly and case-sensitively when using iterables.

## Options

All options are optional. The package exports the `Options` and `Occupations` types.

| Option | Default | Description |
| --- | --- | --- |
| `connector` | `'_'` | Text between the base and numeric suffix. May be empty. |
| `consistent` | `false` | Always include a numeric suffix, including on the first candidate. |
| `pad` | `1` | Minimum suffix width, padded with leading zeros. Must be a positive safe integer. Larger numbers are not truncated. |
| `maximum` | `Number.MAX_SAFE_INTEGER` | Inclusive candidate-number limit. Must be a safe integer ≥ `start`. |
| `start` | `1` | First candidate’s number. Must be a nonnegative safe integer. |

Without `consistent`, the bare base represents `start`, so the next candidate uses `start + 1`: the defaults produce `log`, `log_2`, `log_3`, … With `consistent: true`, they produce `log_1`, `log_2`, `log_3`, …

For example, `getFree('log', ['log'], {maximum: 2})` returns `'log_2'`, while `getFree('log', ['log', 'log_2'], {maximum: 2})` throws. Setting `maximum: start` permits only the first candidate, including the bare base when `consistent` is false.

Invalid numeric options throw a `RangeError` synchronously. Exhaustion of `maximum` also raises a `RangeError`. The candidate at `maximum` is checked, but no higher candidate is tested. Errors from occupation sources propagate unchanged: synchronous execution throws, while errors after switching to asynchronous execution reject the returned promise. The base is treated literally; existing suffixes are not parsed or removed.

This function finds an available ID but does not reserve it. Concurrent callers need external synchronization or an atomic reservation mechanism. Infinite iterable sources never finish; a predicate that always returns `true` keeps searching until `maximum` is exhausted.
