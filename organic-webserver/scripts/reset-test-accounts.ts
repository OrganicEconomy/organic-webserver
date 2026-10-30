import { sequelize } from '../app/models.js'
import { parseResetArgs, listAccountsToRecreate, resetTestAccounts } from './reset-citizens.js'

async function preview(adminMail: string, level: number): Promise<void> {
    const accounts = await listAccountsToRecreate()
    console.log(`${accounts.length} compte(s) actif(s) seraient recréés au niveau ${level} :`)
    for (const account of accounts) console.log(`  ${account.name} <${account.mail}>`)
    console.log(`\nTous les comptes, écosystèmes, paiements en attente et billets encaissés seraient supprimés.`)
    console.log(`Le nouvel écosystème central serait administré par ${adminMail}.`)
    if (!accounts.some((account) => account.mail === adminMail)) {
        console.log(`\n⚠ ${adminMail} n'est pas un compte actif : la réinitialisation serait refusée.`)
    }
    console.log(`\nRien n'a été modifié. Relance avec --confirm pour réinitialiser.`)
}

async function reset(adminMail: string, level: number): Promise<void> {
    const credentials = await resetTestAccounts({ adminMail, level })
    console.log(`✓ ${credentials.length} compte(s) recréé(s) au niveau ${level}, ${adminMail} administre l'écosystème central.\n`)
    console.log(`Identifiants à envoyer (« Restaurer mon compte ») :`)
    for (const credential of credentials) console.log(`  ${credential.mail}\t${credential.password}`)
}

async function main(): Promise<void> {
    const { adminMail, level, confirm } = parseResetArgs(process.argv.slice(2))
    if (confirm) {
        await reset(adminMail, level)
    } else {
        await preview(adminMail, level)
    }
    await sequelize.close()
}

main().catch((err) => {
    console.error(err.message ?? err)
    process.exitCode = 1
})
