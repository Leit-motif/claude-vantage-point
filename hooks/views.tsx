// The native views: each draws one fact kind of an ask item (panes/visuals/facts.ts)
// from the desktop's own elements, as the catalog's technique of the same name.
// The Svg views are panes/visuals/draw.ts; these are the ones built of Box, Text,
// Markdown and Link. The mock album draws through them, and so will the queue
// card. Never takes `$`: register.tsx hands in the elements.
import type { BoxProps, ElementConstructor, LinkProps, MarkdownProps, TextProps } from 'claude-code'
import { joined, type Facts } from '../panes/visuals/facts'
import { fmt, money, withUnit } from '../panes/visuals/draw'
import { FILL, RECOMMENDED, REST_LINE } from './signal'

type F = Required<Facts>

export type ViewElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Markdown: ElementConstructor<MarkdownProps>
  Link: ElementConstructor<LinkProps>
}

/** What one answer costs, summed over its consequences: `up to` where any is a ceiling. */
export const costOf = (said: F['answers']['yes']) => `${said.some(c => c.upTo === true) ? 'up to ' : ''}${money(said.reduce((a, c) => a + (c.cost ?? 0), 0))}`

/**
 * The native views over one set of elements. `newProps` says the engine takes
 * Text's size, weight and tabular, which an engine before 2.1.299 refuses with
 * the whole pane (docs/palette.md).
 */
export function views(el: ViewElements, newProps: boolean) {
  const { Box, Text, Markdown, Link } = el
  const ty = (props: Pick<TextProps, 'size' | 'weight' | 'tabular'>): Pick<TextProps, 'size' | 'weight' | 'tabular'> => (newProps ? props : {})
  const dimUnless = (on: boolean) => (on ? {} : { dimColor: true })
  /** A line that stands on its own starts with a capital, in the rows and the columns alike. */
  const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

  /** Each answer on its own line: the recommended one alone in green, the other grey, a cost trailing where the item names one. */
  const answers = (fact: F['answers'], costShown = false) => {
    // A cost a picture on the card already draws is said once, there (the design review, 2026-10-23).
    const priced = !costShown && [...fact.yes, ...fact.no].some(c => c.cost !== undefined)
    return (
      <Box key="answers" flexDirection="column">
        {(['yes', 'no'] as const).map(which => {
          const on = fact.recommend === which
          return (
            // A wrapped answer keeps its word and its cost on its first line.
            <Box key={which} flexDirection="row" columnGap={1} alignItems="flex-start">
              <Box key="word" width={4} flexShrink={0}>
                <Text {...(on ? { color: RECOMMENDED } : { dimColor: true })}>{which === 'yes' ? 'Yes' : 'No'}</Text>
              </Box>
              <Box key="what" flexGrow={1} flexShrink={1}>
                <Text {...dimUnless(on)}>{sentence(joined(fact[which]))}</Text>
              </Box>
              {priced ? (
                <Text key="price" {...dimUnless(on)} {...ty({ tabular: true })}>
                  {costOf(fact[which])}
                </Text>
              ) : null}
            </Box>
          )
        })}
      </Box>
    )
  }

  /** What each answer sets off, side by side: a column per answer, its word green only where recommended. */
  const outcomes = (fact: F['answers']) => {
    const priced = [...fact.yes, ...fact.no].some(c => c.cost !== undefined)
    return (
    <Box key="outcomes" flexDirection="row" columnGap={1}>
      {(['yes', 'no'] as const).map(which => {
        const on = fact.recommend === which
        return (
          <Box key={which} flexDirection="column" width="50%" flexShrink={1} borderStyle="round" borderColor={REST_LINE} paddingX={1}>
            <Box key="head" flexDirection="row" justifyContent="space-between" columnGap={1}>
              <Text {...(on ? { color: RECOMMENDED } : { dimColor: true })}>{which === 'yes' ? 'Yes' : 'No'}</Text>
              {priced ? (
                <Text {...dimUnless(on)} {...ty({ tabular: true })}>
                  {costOf(fact[which])}
                </Text>
              ) : null}
            </Box>
            {fact[which].map((c, i) => (
              <Text key={`c${i}`} {...dimUnless(on)}>
                {sentence(c.does)}
              </Text>
            ))}
          </Box>
        )
      })}
    </Box>
    )
  }

  /** Two or three figures as tiles: the first leads, its value large; the others follow quiet and small. */
  const tiles = (figures: F['figures']) => (
    <Box key="tiles" flexDirection="row" columnGap={1}>
      {figures.map((one, i) => (
        <Box key={one.label} flexDirection="column" width={`${Math.floor(100 / figures.length)}%`} flexShrink={1} borderStyle="round" borderColor={REST_LINE} backgroundColor={FILL} paddingX={1}>
          <Text dimColor {...ty({ size: 'caption' })}>
            {one.label}
          </Text>
          {i === 0 ? (
            <Text {...ty({ size: 'title', weight: 'medium', tabular: true })}>{withUnit(one.value, one.unit)}</Text>
          ) : (
            // One step down from the lead: its size, never its colour too (the design review, 2026-10-23).
            <Text {...ty({ tabular: true })}>{withUnit(one.value, one.unit)}</Text>
          )}
        </Box>
      ))}
    </Box>
  )

  /** The option that does better on a row, by index, or null on a tie. */
  const winner = (row: F['comparison']['rows'][number]) => {
    const best = row.better === 'lower' ? Math.min(...row.values) : Math.max(...row.values)
    const at = row.values.filter(v => v === best)
    return at.length === 1 ? row.values.indexOf(best) : null
  }

  /**
   * A ledger: the measure in the reader's words, then a cell per option; the
   * better cell white, the others grey. `marked` greens the recommended action,
   * which a card leaves to its answers so the signal sits on one element.
   */
  const ledger = (fact: F['comparison'], marked = true) => {
    const share = `${Math.floor(60 / fact.options.length)}%`
    // The rows the recommended option wins come first, so the picture reads the way the recommendation goes,
    // and the direction is said once in the head, or on each row when the rows differ (the design review, 2026-10-23).
    const rows = fact.recommended === undefined ? fact.rows : [...fact.rows.filter(r => winner(r) === fact.recommended), ...fact.rows.filter(r => winner(r) !== fact.recommended)]
    // Rows said in words rank by a score the reader never sees, so no direction is printed for them.
    const worded = fact.rows.every(r => r.cells !== undefined)
    const lower = fact.rows.every(r => r.better === 'lower')
    const higher = fact.rows.every(r => r.better === 'higher')
    const head = worded ? '' : lower ? 'lower is better' : higher ? 'higher is better' : ''
    return (
      <Box key="ledger" flexDirection="column">
        <Box key="head" flexDirection="row">
          <Box key="what" width="40%" flexShrink={0}>
            <Text dimColor>{head}</Text>
          </Box>
          {fact.options.map((option, i) => (
            <Box key={option} width={share} flexShrink={0}>
              <Text {...(marked && fact.recommended === i ? { color: RECOMMENDED } : {})}>{fact.actions?.[i] ?? option}</Text>
            </Box>
          ))}
        </Box>
        {rows.map(row => {
          const win = winner(row)
          return (
            <Box key={row.label} flexDirection="row">
              <Box key="what" width="40%" flexShrink={0}>
                <Text dimColor>{head === '' && !worded ? `${row.label} ${row.better === 'lower' ? '↓' : '↑'}` : row.label}</Text>
              </Box>
              {row.values.map((v, i) => (
                <Box key={`v${i}`} width={share} flexShrink={0}>
                  <Text {...dimUnless(fact.recommended === undefined ? win === null || win === i : win === i && i === fact.recommended)} {...ty({ tabular: true })}>
                    {row.cells?.[i] ?? fmt(v, row.unit)}
                  </Text>
                </Box>
              ))}
            </Box>
          )
        })}
      </Box>
    )
  }

  /** The comparison as a Markdown table, the better value on each row in bold. */
  const table = (fact: F['comparison']) => {
    const worded = fact.rows.every(r => r.cells !== undefined)
    const lower = fact.rows.every(r => r.better === 'lower')
    const higher = fact.rows.every(r => r.better === 'higher')
    const head = worded ? '' : lower ? 'lower is better' : higher ? 'higher is better' : ''
    const rows = fact.rows.map(row => {
      const win = winner(row)
      const cells = row.values.map((v, i) => {
        const said = row.cells?.[i] ?? fmt(v, row.unit)
        return i === win ? `**${said}**` : said
      })
      return `| ${row.label} | ${cells.join(' | ')} |`
    })
    return <Markdown key="table" text={[`| ${head} | ${fact.options.join(' | ')} |`, `|---|${fact.options.map(() => '---:').join('|')}|`, ...rows].join('\n')} />
  }

  /** Each claim with its source's number, linked; then the numbered sources. */
  const sources = (fact: F['sources']) => {
    const number = (label: string) => fact.sources.findIndex(s => s.label === label) + 1
    const url = (label: string) => fact.sources.find(s => s.label === label)?.url ?? ''
    return [
      <Markdown key="claims" text={fact.claims.map(c => `${c.text} [${number(c.source)}](${url(c.source)})`).join('\n\n')} />,
      <Box key="list" flexDirection="column">
        {fact.sources.map((s, i) => (
          <Link key={`s${i}`} href={s.url} label={`${i + 1}  ${s.label}`} />
        ))}
      </Box>,
    ]
  }

  /** One detail behind a hover: its name quiet with ▸, its meaning shown while the pointer is over it. */
  const reveal = (term: F['terms'][number]) => (
    <Box key="reveal" flexDirection="column">
      <Text dimColor>{`${term.term} ▸`}</Text>
      <Box display="none" hover={{ display: 'flex' }}>
        <Text>{term.meaning}</Text>
      </Box>
    </Box>
  )

  // --- The decision's context (#102): tiles a page packs around the ask. ---

  /** How far a source can be trusted, as a mark and a word: the mark brightest where a person checked it. */
  const TRUST = { checked: ['●', 'checked'], measured: ['◐', 'measured'], reported: ['○', 'reported'], guess: ['◌', 'a guess'] } as const

  /** Each source: its trust mark, its name, what it says, and the answer it points to, green only where that is the recommendation. */
  const evidence = (fact: F['evidence'], recommend?: 'yes' | 'no') => (
    <Box key="evidence" flexDirection="column" rowGap={1}>
      {fact.map((one, i) => {
        const [mark, word] = TRUST[one.trust]
        const checked = one.trust === 'checked'
        return (
          <Box key={`e${i}`} flexDirection="column">
            <Box key="head" flexDirection="row" columnGap={1}>
              <Text key="mark" {...dimUnless(checked)}>{mark}</Text>
              <Box key="label" flexGrow={1} flexShrink={1}>
                <Text {...dimUnless(checked)}>{one.weight === undefined ? one.label : `${one.label}, ${withUnit(one.weight, one.unit)}`}</Text>
              </Box>
              <Text key="trust" dimColor>
                {word}
              </Text>
              {/* On the source's own line, so the answer it points to never wraps into what it says (the owner's shot, 2026-10-23). */}
              {one.favours === undefined ? null : (
                <Text key="favours" {...(one.favours === recommend ? { color: RECOMMENDED } : { dimColor: true })}>
                  {`→ ${one.favours}`}
                </Text>
              )}
            </Box>
            <Box key="says" paddingLeft={2}>
              <Text dimColor>{sentence(one.says)}</Text>
            </Box>
          </Box>
        )
      })}
    </Box>
  )

  /** How far a change reaches, as a mark: the wider, the brighter. */
  const REACH = { wide: '■', small: '▪', none: '·' } as const

  /** What each answer changes, side by side when `wide`, else one under the other; the recommended answer's word alone in green. */
  const impact = (fact: F['impact'], recommend: 'yes' | 'no' | undefined, wide: boolean) => (
    <Box key="impact" flexDirection={wide ? 'row' : 'column'} columnGap={2} rowGap={1}>
      {(['yes', 'no'] as const).map(which => (
        <Box key={which} flexDirection="column" {...(wide ? { width: '50%', flexShrink: 1 } : {})}>
          <Text key="word" {...(recommend === which ? { color: RECOMMENDED } : { dimColor: true })}>
            {which === 'yes' ? 'If yes' : 'If no'}
          </Text>
          {fact[which].map((one, i) => (
            <Box key={`c${i}`} flexDirection="column">
              <Box key="what" flexDirection="row" columnGap={1} alignItems="flex-start">
                <Text key="reach" {...dimUnless(one.reach === 'wide')}>{REACH[one.reach]}</Text>
                <Box key="text" flexShrink={1}>
                  <Text {...dimUnless(one.reach !== 'none')}>{sentence(one.what)}</Text>
                </Box>
              </Box>
              {one.undo === undefined ? null : (
                <Box key="undo" paddingLeft={2}>
                  <Text dimColor>{`Undo: ${one.undo}`}</Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )

  /** The case for and against the recommended answer: two columns when `wide`, else for over against. */
  const tradeoffs = (fact: F['tradeoffs'], wide: boolean) => (
    <Box key="tradeoffs" flexDirection={wide ? 'row' : 'column'} columnGap={2} rowGap={1}>
      {([['pros', '+'], ['cons', '−']] as const).map(([side, mark]) => (
        <Box key={side} flexDirection="column" {...(wide ? { width: '50%', flexShrink: 1 } : {})}>
          {fact[side].map((line, i) => (
            <Box key={`${side}${i}`} flexDirection="row" columnGap={1} alignItems="flex-start">
              <Text key="mark" dimColor>
                {mark}
              </Text>
              <Box key="text" flexShrink={1}>
                <Text>{sentence(line)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      ))}
    </Box>
  )

  /** Each catch: a risk that could change the answer in white, one to watch in grey; the tile's amber frame marks a risk. */
  // A list of one needs no marker, and a mark is the grey bullet: an amber ! said the frame's risk twice (the owner, 2026-10-27).
  const gotchas = (fact: F['gotchas']) => (
    <Box key="gotchas" flexDirection="column">
      {[...fact.filter(one => one.level === 'risk'), ...fact.filter(one => one.level === 'watch')].map((one, i) => (
        <Box key={`g${i}`} flexDirection="row" columnGap={1} alignItems="flex-start">
          {fact.length === 1 ? null : <Text key="mark" dimColor>•</Text>}
          <Box key="text" flexShrink={1}>
            <Text {...dimUnless(one.level === 'risk')}>{sentence(one.text)}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )

  /** Each earlier ruling: when, what was asked, the ruling, and what came of it. */
  const precedent = (fact: F['precedent']) => (
    <Box key="precedent" flexDirection="column" rowGap={1}>
      {fact.map((one, i) => (
        <Box key={`p${i}`} flexDirection="column">
          <Box key="head" flexDirection="row" columnGap={1}>
            <Box key="ask" flexGrow={1} flexShrink={1}>
              <Text>{sentence(one.ask)}</Text>
            </Box>
            <Text key="ruled">{one.ruled === 'yes' ? 'Yes' : 'No'}</Text>
          </Box>
          <Text key="when" dimColor>
            {one.came === undefined ? one.when : `${one.when} · ${one.came}`}
          </Text>
        </Box>
      ))}
    </Box>
  )

  /** Each thing a yes changes, named in white, how in grey. */
  const touches = (fact: F['touches']) => (
    <Box key="touches" flexDirection="column">
      {fact.map((one, i) => (
        <Box key={`t${i}`} flexDirection="row" columnGap={1}>
          <Text key="name">{one.name}</Text>
          <Box key="change" flexShrink={1}>
            <Text dimColor>{one.change}</Text>
          </Box>
        </Box>
      ))}
    </Box>
  )

  return { answers, outcomes, tiles, ledger, table, sources, reveal, winner, evidence, impact, tradeoffs, gotchas, precedent, touches }
}

export type Views = ReturnType<typeof views>
