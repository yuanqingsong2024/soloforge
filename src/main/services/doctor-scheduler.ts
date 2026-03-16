import { PrismaClient } from '@prisma/client'
import { DoctorService } from './doctor-service'
import { EventBusService } from './event-bus'

const prisma = new PrismaClient()

/**
 * 轻量级巡检调度器
 * 当前使用进程内定时轮询；后续可替换为更可靠的作业调度框架。
 */
export class DoctorSchedulerService {
  private static timer: NodeJS.Timeout | null = null
  private static running = false

  static start() {
    if (this.timer) return
    this.timer = setInterval(() => {
      void this.tick()
    }, 60_000)
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  static async tick() {
    if (this.running) return
    this.running = true
    try {
      const schedules = await prisma.doctorSchedule.findMany({ where: { enabled: true } })
      const now = Date.now()

      for (const schedule of schedules) {
        const lastRunAt = schedule.lastRunAt?.getTime() ?? 0
        const dueMs = schedule.intervalMinutes * 60_000
        if (lastRunAt !== 0 && now - lastRunAt < dueMs) {
          continue
        }

        const report = await DoctorService.runFullDiagnostic(schedule.workspaceId, 'scheduler')
        await prisma.doctorSchedule.update({
          where: { id: schedule.id },
          data: { lastRunAt: new Date() }
        })

        await EventBusService.emit({
          workspaceId: schedule.workspaceId,
          targetId: schedule.targetId || null,
          sourceType: 'DOCTOR',
          sourceId: report.id,
          eventType: 'DOCTOR_SCHEDULED_RUN_COMPLETED',
          severity: report.severity === 'CRITICAL' ? 'CRITICAL' : report.severity === 'ERROR' ? 'ERROR' : report.severity === 'WARNING' ? 'WARN' : 'INFO',
          title: '定时巡检完成',
          summary: report.summary,
          payload: {
            scheduleId: schedule.id,
            reportId: report.id
          }
        })
      }
    } finally {
      this.running = false
    }
  }
}

export { prisma }
