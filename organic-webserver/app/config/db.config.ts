/**
 * Database connection. SQLite by default: a community server has a tiny load
 * and stores JSON blobs, so `npm install && npm start` must need no external
 * database — backing up is copying one file. Postgres remains available for
 * bigger deployments via DB_DIALECT=postgres (recipes in the organic-deploy
 * repository).
 */
import { Sequelize } from 'sequelize'
import type { Dialect } from 'sequelize'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const DEFAULT_SQLITE_FILE = path.join('data', 'organic.sqlite')

function makeSequelize(): Sequelize {
  if (process.env.NODE_ENV === 'test') {
    return new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
  }

  const dialect = (process.env.DB_DIALECT || 'sqlite') as Dialect

  if (dialect === 'sqlite') {
    const storage = process.env.DB_STORAGE || DEFAULT_SQLITE_FILE
    mkdirSync(path.dirname(storage), { recursive: true })
    return new Sequelize({ dialect, storage, logging: false })
  }

  return new Sequelize(process.env.DB_NAME!, process.env.DB_USER!, process.env.DB_PASSWORD, {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : undefined,
    dialect,
    logging: false,
    pool: { max: 5, min: 0, acquire: 30000, idle: 10000 },
  })
}

export const sequelize = makeSequelize()
