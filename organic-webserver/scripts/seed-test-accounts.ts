import { sequelize } from '../app/models.js'
import { parseSeedArgs, seedCitizen } from './seed-citizen.js'

async function main(): Promise<void> {
    const options = parseSeedArgs(process.argv.slice(2))
    const citizen = await seedCitizen(options)

    console.log(`✓ ${options.name}  niveau ${citizen.getLevel()}  solde ${citizen.getAvailableMoneyAmount()}`)
    console.log(`\nConnecte-toi dans la webapp via "Restaurer mon compte" avec :`)
    console.log(`  mail : ${options.mail}`)
    console.log(`  mot de passe : ${options.password}`)

    await sequelize.close()
}

main().catch((err) => {
    console.error(err.message ?? err)
    process.exitCode = 1
})
