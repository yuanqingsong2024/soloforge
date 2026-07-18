/**
 * Communications 路由模块
 * 
 * 注意：路由已拆分到独立文件：
 * - comms-profiles.ts: 通讯配置管理
 * - comms-targets.ts: 通讯目标管理
 * - contacts.ts: 联系人管理
 * - message-templates.ts: 消息模板管理
 * - outbound-messages.ts: 外发消息管理
 * 
 * 本文件保留空实现以保持 API 兼容性。
 */

import { type FastifyInstance } from 'fastify'

/**
 * @deprecated 路由已拆分到独立文件
 */
export function registerCommunicationsRoutes(_fastify: FastifyInstance): void {
  // 路由已拆分到独立文件：
  // - registerCommsProfilesRoutes (comms-profiles.ts)
  // - registerCommsTargetsRoutes (comms-targets.ts)
  // - registerContactsRoutes (contacts.ts)
  // - registerMessageTemplatesRoutes (message-templates.ts)
  // - registerOutboundMessagesRoutes (outbound-messages.ts)
}
