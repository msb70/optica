// Valida todas las queries GraphQL del frontend contra un Hasura (local o Nhost).
// Uso: node scripts/check_queries.mjs <graphql_url> <admin_secret>
import fs from 'node:fs'
import { execSync } from 'node:child_process'
const [url = 'http://localhost:8080/v1/graphql', secret = 'localsecret'] = process.argv.slice(2)
const psql = (sql) => execSync(`psql -h localhost -U postgres -d optica -At -c "${sql}"`, { env: { ...process.env, PGPASSWORD: 'postgres' } }).toString().trim()
let ids = {}
try { ids = { company: psql("select id from companies where code='OPTILUX'"), branch: psql("select id from branches where code='OBA'"), id: psql('select id from customers limit 1') } } catch { /* sin psql: pedimos a Hasura */ }
if (!ids.company) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': secret }, body: JSON.stringify({ query: '{ companies(limit:1){id} branches(limit:1){id} customers(limit:1){id} }' }) }).then((r) => r.json())
  ids = { company: r.data.companies[0]?.id, branch: r.data.branches[0]?.id, id: r.data.customers[0]?.id }
}
const all = { ...ids, q: '%a%', source: ['walk-in'], status: ['abierta'], from: '2026-04-01', fromTs: '2026-04-01T00:00:00Z', to: '2026-09-17T00:00:00', closed: false, open: false, scopeBranch: false, today: '2026-09-16', exam: null, code: 'X', examFilter: { customer_id: { _eq: ids.id } } }
const files = [...fs.readdirSync('src/pages').map((f) => 'src/pages/' + f), 'src/components/Layout.tsx', 'src/lib/app.tsx']
let bad = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  for (const m of src.matchAll(/`(query[\s\S]*?)`/g)) {
    const q = m[1]
    const declared = [...(q.match(/^query[^{]*\(([^)]*)\)/)?.[1] || '').matchAll(/\$(\w+)/g)].map((x) => x[1])
    const vars = Object.fromEntries(declared.map((k) => [k, all[k]]))
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-hasura-admin-secret': secret, 'x-hasura-role': 'user' }, body: JSON.stringify({ query: q, variables: vars }) }).then((r) => r.json())
    const name = (q.match(/query\s+(\w+)/) || [])[1] || 'anon'
    if (r.errors) { bad++; console.log(`✗ ${f} ${name}: ${r.errors[0].message.slice(0, 220)}`) } else console.log(`✓ ${f} ${name} (${JSON.stringify(r.data).length} bytes)`)
  }
}
process.exit(bad ? 1 : 0)
