import { describe, it, expect } from 'vitest'
import { prisma } from '../src/utils/prisma'

describe('database', () => {
  it('SELECT 1 通过', async () => {
    const rows = await prisma.$queryRaw`SELECT 1 AS one`
    expect(rows).toEqual([{ one: 1n }])
  })
})
