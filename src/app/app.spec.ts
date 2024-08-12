import { makeLogger } from 'lido-nanolib'
import nock from 'nock'
import { makeConfig as mC } from '../services/config/service.js'
import { mockEthServer } from '../test/mock-eth-server.js'
import * as ELMocks from '../services/execution-api/fixtures.js'
import * as CLMocks from '../services/consensus-api/fixtures.js'
import dotenv from 'dotenv'
import { configBase } from '../test/config.js'

dotenv.config()

const mockConfig = async (config) => {
  const { makeConfig } = (await vi.importActual(
    '../services/config/service.js'
  )) as { makeConfig: typeof mC }

  vi.doMock('../services/config/service.js', () => {
    return {
      makeConfig() {
        return {
          ...makeConfig({
            env: { ...configBase, ...config },
            logger: makeLogger({
              level: 'error',
              format: 'simple',
            }),
          }),
          HTTP_PORT: undefined,
        }
      },
      makeLoggerConfig() {
        return {
          level: 'debug',
          format: 'simple',
        }
      },
      makeWebhookProcessorConfig() {
        return {
          WEBHOOK_ABORT_TIMEOUT_MS: 10_000,
          WEBHOOK_MAX_RETRIES: 0,
        }
      },
    }
  })
}

const getApp = async () => {
  const { makeAppModule } = await import('./module.js')
  return makeAppModule()
}

describe('App bootstrap', () => {
  beforeEach(() => {
    Object.values(ELMocks).forEach((mock) => {
      mockEthServer(mock() as any, configBase.EXECUTION_NODE)
    })
    Object.values(CLMocks).forEach((mock) => {
      mockEthServer(mock() as any, configBase.CONSENSUS_NODE)
    })
    vi.resetModules()
  })

  afterEach(() => {
    nock.cleanAll()
  })

  it('should bootstrap the app with MESSAGES_LOCATION', async () => {
    await mockConfig({
      MESSAGES_LOCATION: 'encryptor',
      VALIDATOR_EXIT_WEBHOOK: undefined,
      PROM_PREFIX: 'test',
    })

    const module = await getApp()
    await module.run()
    await module.destroy()
  })

  it('should bootstrap the app with VALIDATOR_EXIT_WEBHOOK', async () => {
    await mockConfig({
      MESSAGES_LOCATION: undefined,
      VALIDATOR_EXIT_WEBHOOK: 'https://example.com/webhook',
      PROM_PREFIX: 'test_2',
    })

    const module = await getApp()
    await module.run()
    await module.destroy()
  })

  it('should throw an error if both MESSAGES_LOCATION and VALIDATOR_EXIT_WEBHOOK are defined', async () => {
    await mockConfig({
      MESSAGES_LOCATION: 'messages',
      VALIDATOR_EXIT_WEBHOOK: 'https://example.com/webhook',
      PROM_PREFIX: 'test_3',
    })

    await expect(getApp).rejects.toThrowError(
      'Both MESSAGES_LOCATION and VALIDATOR_EXIT_WEBHOOK are defined. Ensure only one is set.'
    )
  })

  it('should throw an error if neither MESSAGES_LOCATION nor VALIDATOR_EXIT_WEBHOOK are defined', async () => {
    await mockConfig({
      MESSAGES_LOCATION: undefined,
      VALIDATOR_EXIT_WEBHOOK: undefined,
      PROM_PREFIX: 'test_4',
    })

    await expect(getApp).rejects.toThrowError(
      'Neither MESSAGES_LOCATION nor VALIDATOR_EXIT_WEBHOOK are defined. Please set one of them.'
    )
  })
}, 100_000)
