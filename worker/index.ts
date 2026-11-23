import { app } from './app.ts'

export { AssistantRelay } from './assistant/relay.ts'

export default { fetch: app.fetch } satisfies ExportedHandler<Env>
