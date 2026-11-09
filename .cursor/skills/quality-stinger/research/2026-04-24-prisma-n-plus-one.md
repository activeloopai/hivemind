# Prisma N+1 Query Problem - Detection and Fixes

**Sources:**
- https://www.prisma.io/docs/orm/prisma-client/queries/advanced/query-optimization-performance
- https://www.prisma.io/docs/orm/more/best-practices
- https://www.prisma.io/docs/postgres/database/query-insights
- https://medium.com/@saad.minhas.codes/n-1-query-problem-the-database-killer-youre-creating-f68104b99a2d
- https://furkanbaytekin.dev/blogs/n1-query-problem-fixing-it-with-sql-and-prisma-orm

**Retrieved:** 2026-04-24
**Query used:** `Prisma N+1 query problem detection and fix patterns`

## Summary

The N+1 query problem: one query fetches a list of N parent records, then N additional queries fetch related data - one per parent - instead of a single batched query. This is the single most common performance regression in ORM-backed Next.js apps and a leading Detrimental Pattern the Bee should flag.

## Detection signatures (for code review)

1. **Loop-over-findUnique/findFirst:** any code of the shape `for (const item of items) { await prisma.x.findUnique(...) }` or `items.map(i => prisma.x.findUnique(...))` without `Promise.all` or `include`.
2. **Missing `include` on a list read followed by per-item field access:** `prisma.user.findMany()` returning `users`, followed by `users.map(u => u.posts)` where `posts` is a relation - Prisma won't populate `posts` without `include: { posts: true }`, and calling `.posts()` in a loop is the canonical N+1.
3. **Server component fetch-per-item:** in Next.js server components, repeated awaits inside a `.map()` over a list.
4. **Missing FK index:** any column used in a Prisma `include`, `where`, or `orderBy` that lacks `@@index` or `@index` in `schema.prisma`.

## Fix patterns

- Eager load with `include` or `select`: `prisma.user.findMany({ include: { posts: true } })`.
- Use `relationLoadStrategy: "join"` (Prisma 5.7+) to push the join into the database.
- Prisma's built-in dataloader batches `findUnique` calls in the same tick.
- For GraphQL resolvers, use the fluent API: `prisma.user.findUnique({ where: { id } }).posts()`.
- Add indexes on every FK column appearing in `include`, `where`, or `orderBy`.

## Key quotations

> "The N+1 problem occurs when you run 1 query to fetch a list, then 1 additional query per item in that list."

> "Every FK column in a Prisma include, where, or orderBy needs an index."

> "Prisma's dataloader automatically batches findUnique() queries in the same tick."

## Relevance to this stinger

This feeds the Detrimental Patterns checklist in `guides/04-five-axis-evaluation.md`. In a Next.js/Prisma codebase, an N+1 in a server component or API route is a Critical finding if it's on a hot path (dashboard, feed) and a Warning on a cold path (admin only). The Bee should scan the diff for the three detection signatures above and flag with `file:line` plus suggested fix.
