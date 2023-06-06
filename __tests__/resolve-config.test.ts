import fs from 'fs'

import {expect, test} from '@jest/globals'
import * as resolveConfig from '../src/resolve-config'
import {config} from '../src/fixtures'
import type {synthetics} from '@datadog/datadog-ci'

const requiredInputs = {
  apiKey: 'xxx',
  appKey: 'yyy',
}

const mockReporter: synthetics.MainReporter = {
  error: jest.fn(),
  initErrors: jest.fn(),
  log: jest.fn(),
  reportStart: jest.fn(),
  resultEnd: jest.fn(),
  resultReceived: jest.fn(),
  runEnd: jest.fn(),
  testTrigger: jest.fn(),
  testWait: jest.fn(),
  testsWait: jest.fn(),
}

describe('Resolves Config', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    process.env = {
      ...process.env,
      INPUT_API_KEY: requiredInputs.apiKey,
      INPUT_APP_KEY: requiredInputs.appKey,
    }
  })

  test('Default configuration parameters get overridden by global configuration file', async () => {
    const fakeReadFile = ((
      path: string,
      encoding: string,
      callback: (error: NodeJS.ErrnoException | null, data: Buffer) => void
    ) => {
      callback(null, Buffer.from(JSON.stringify({files: ['foobar.synthetics.json']})))
    }) as typeof fs.readFile
    jest.spyOn(fs, 'existsSync').mockImplementation(() => true)
    jest.spyOn(fs, 'readFile').mockImplementation(fakeReadFile)
    await expect(resolveConfig.resolveConfig(mockReporter)).resolves.toStrictEqual({
      ...config,
      ...requiredInputs,
      files: ['foobar.synthetics.json'],
    })
  })

  test('Default configuration applied if global configuration empty', async () => {
    jest.spyOn(fs, 'existsSync').mockImplementation(() => false)
    await expect(resolveConfig.resolveConfig(mockReporter)).resolves.toStrictEqual({...config, ...requiredInputs})
  })

  test('Variable strings input set in the config when defined', async () => {
    process.env = {
      ...process.env,
      INPUT_VARIABLES: 'START_URL=https://example.org,MY_VARIABLE=My title',
    }

    await expect(resolveConfig.resolveConfig(mockReporter)).resolves.toStrictEqual({
      ...config,
      ...requiredInputs,
      global: {
        variables: {START_URL: 'https://example.org', MY_VARIABLE: 'My title'},
      },
    })

    delete process.env.INPUT_VARIABLES

    await expect(resolveConfig.resolveConfig(mockReporter)).resolves.toStrictEqual({
      ...config,
      ...requiredInputs,
    })
  })

  test('getDefinedInput returns undefined if Github Action input not set', async () => {
    expect(resolveConfig.getDefinedInput('foobar')).toBeUndefined()
  })

  test('core.getInputs throws if required params not defined', async () => {
    process.env = {}
    await expect(resolveConfig.resolveConfig(mockReporter)).rejects.toThrowError()
  })

  describe('parses boolean', () => {
    test('but throws if incorrect value', async () => {
      process.env = {
        ...process.env,
        INPUT_TUNNEL: 'not_a_bool',
      }
      await expect(resolveConfig.resolveConfig(mockReporter)).rejects.toThrow(
        /Input does not meet YAML 1.2 \"Core Schema\" specification: tunnel/
      )
    })

    test('if value meets YAML 1.2', async () => {
      process.env = {
        ...process.env,
        INPUT_TUNNEL: 'True',
      }
      expect((await resolveConfig.resolveConfig(mockReporter)).tunnel).toBe(true)
    })
  })

  describe('parses integer', () => {
    // datadog-ci pushes pollingTimeout from root config to global config if pollingTimeout is undefined in the global config
    // the implementation: https://github.com/DataDog/datadog-ci/blob/8000318d70fd8af22b0e377b27078762b562efb7/src/commands/synthetics/command.ts#L228
    // the test: https://github.com/DataDog/datadog-ci/blob/65ffde5d90474af5930da4c2faf016505b70bff9/src/commands/synthetics/__tests__/cli.test.ts#L173-L186

    test('falls back to default if input is not set', async () => {
      expect(resolveConfig.getDefinedInteger('polling_timeout')).toBeUndefined()
      // datadog-ci overrides global.pollingTimeout with pollingTimeout if the former is undefined, see comment above
      expect((await resolveConfig.resolveConfig(mockReporter)).global.pollingTimeout).toBeUndefined()
      expect((await resolveConfig.resolveConfig(mockReporter)).pollingTimeout).toStrictEqual(30 * 60 * 1000)
    })

    test('falls back to default if input is an empty value', async () => {
      process.env = {
        ...process.env,
        INPUT_POLLING_TIMEOUT: '',
      }
      expect(resolveConfig.getDefinedInteger('polling_timeout')).toBeUndefined()
      // datadog-ci overrides global.pollingTimeout with pollingTimeout if the former is undefined, see comment above
      expect((await resolveConfig.resolveConfig(mockReporter)).global.pollingTimeout).toBeUndefined()
      expect((await resolveConfig.resolveConfig(mockReporter)).pollingTimeout).toStrictEqual(30 * 60 * 1000)
    })

    test('throws if input is a float', async () => {
      process.env = {
        ...process.env,
        INPUT_POLLING_TIMEOUT: '1.2',
      }
      await expect(resolveConfig.resolveConfig(mockReporter)).rejects.toThrow('1.2 is not an integer')
    })

    test('returns the value if input is an integer', async () => {
      process.env = {
        ...process.env,
        INPUT_POLLING_TIMEOUT: '1',
      }
      expect((await resolveConfig.resolveConfig(mockReporter)).global.pollingTimeout).toStrictEqual(1)
    })
  })
})
