import type { LoggerService } from 'lido-nanolib'
import type { ExecutionApiService } from '../execution-api/service.js'
import type { ConfigService } from '../config/service.js'
import type { MessagesProcessorService } from '../messages-processor/service.js'
import type { ConsensusApiService } from '../consensus-api/service.js'
import type { WebhookProcessorService } from '../webhook-caller/service.js'
import type { MetricsService } from 'services/prom/service.js'

export type ExitMessage = {
  message: {
    epoch: string
    validator_index: string
  }
  signature: string
}

export type JobProcessorService = ReturnType<typeof makeJobProcessor>

export const makeJobProcessor = ({
  logger,
  config,
  executionApi,
  consensusApi,
  messagesProcessor,
  webhookProcessor,
  metrics,
}: {
  logger: LoggerService
  config: ConfigService
  executionApi: ExecutionApiService
  consensusApi: ConsensusApiService
  messagesProcessor: MessagesProcessorService
  webhookProcessor: WebhookProcessorService
  metrics: MetricsService
}) => {
  const handleJob = async ({
    eventsNumber,
    messages,
  }: {
    eventsNumber: number
    messages: ExitMessage[]
  }) => {
    logger.info('Job started', {
      operatorId: config.OPERATOR_ID,
      stakingModuleId: config.STAKING_MODULE_ID,
      loadedMessages: messages.length,
    })

    // Resolving contract addresses on each job to automatically pick up changes without requiring a restart
    await executionApi.resolveExitBusAddress()
    await executionApi.resolveConsensusAddress()

    const toBlock = await executionApi.latestBlockNumber()
    const fromBlock = toBlock - eventsNumber
    logger.info('Fetched the latest block from EL', { latestBlock: toBlock })

    logger.info('Fetching request events from the Exit Bus', {
      eventsNumber,
      fromBlock,
      toBlock,
    })

    const eventsForEject = await executionApi.logs(fromBlock, toBlock)

    logger.info('Handling ejection requests', {
      amount: eventsForEject.length,
    })

    for (const [ix, event] of eventsForEject.entries()) {
      logger.info(`Handling exit ${ix + 1}/${eventsForEject.length}`, event)

      try {
        if (await consensusApi.isExiting(event.validatorPubkey)) {
          logger.info('Validator is already exiting(ed), skipping')
          continue
        }

        if (config.DRY_RUN) {
          logger.info('Not initiating an exit in dry run mode')
          continue
        }

        if (config.VALIDATOR_EXIT_WEBHOOK) {
          await webhookProcessor.send(config.VALIDATOR_EXIT_WEBHOOK, event)
        } else {
          await messagesProcessor.exit(messages, event)
        }
      } catch (e) {
        logger.error(`Unable to process exit for ${event.validatorPubkey}`, e)
        metrics.exitActions.inc({ result: 'error' })
      }
    }

    logger.info('Updating exit messages left metrics from contract state')
    try {
      const lastRequestedValIx =
        await executionApi.lastRequestedValidatorIndex()
      metrics.updateLeftMessages(messages, lastRequestedValIx)
    } catch {
      logger.error(
        'Unable to update exit messages left metrics from contract state'
      )
    }

    logger.info('Job finished')
  }

  return { handleJob }
}
