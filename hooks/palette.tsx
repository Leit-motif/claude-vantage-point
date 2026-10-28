// The palette specimen (`/vantage-point palette`): every element the desktop's
// table draws, each variant beside its name, one page per element, so a shot of
// the app shows what docs/palette.md says a mod can paint. A specimen that fails
// on the desktop says so in a dim note beside it. It is a pane of its own, never
// the queue's. Never takes `$`: register.tsx hands it the element table, what it
// holds, the presses, and the Clients, whose module paths must sit in
// register.tsx's own source.
import type {
  BoxProps,
  ButtonProps,
  CodeProps,
  ElementConstructor,
  InputProps,
  LinkProps,
  MarkdownProps,
  RenderElement,
  SelectProps,
  Space,
  SvgProps,
  TextProps,
  ThemeKey,
} from 'claude-code'
import type { HumanQueuePalette, HumanQueuePalettePage } from '../types'
import { CARD_LINE, FILL, QUIET, RECOMMENDED, REST_LINE, SIGNAL_BLUE, SIGNAL_RED, SIGNAL_YELLOW } from './signal'

export const PAGES: readonly { key: HumanQueuePalettePage; name: string }[] = [
  { key: 'text', name: 'Text' },
  { key: 'type', name: 'Type' },
  { key: 'colour', name: 'Colour' },
  { key: 'button', name: 'Button' },
  { key: 'field', name: 'Field' },
  { key: 'border', name: 'Border' },
  { key: 'hover', name: 'Hover' },
  { key: 'svg', name: 'Svg' },
  { key: 'rich', name: 'Rich' },
  { key: 'pointer', name: 'Pointer' },
]

/** The hover group the Hover page's two members and the palette command's transcript row share. */
export const SCOPE = 'palette-scope'

export const PALETTE_START: HumanQueuePalette = { page: 'text', log: [], input: '', select: 'beta' }

export type PaletteElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Input: ElementConstructor<InputProps>
  Select: ElementConstructor<SelectProps>
  Svg: ElementConstructor<SvgProps>
  Link: ElementConstructor<LinkProps>
  Markdown: ElementConstructor<MarkdownProps>
  Code: ElementConstructor<CodeProps>
}

export type PaletteActs = {
  page: (page: HumanQueuePalettePage) => Promise<void>
  /** Writes one line to the log the page shows: what was pressed, typed or picked. */
  log: (line: string) => Promise<void>
  input: (value: string) => Promise<void>
  select: (value: string) => Promise<void>
}

/** The Pointer page's Clients, drawn by register.tsx: the log, one per element a Client may draw, and a broken one. */
export type PaletteClients = {
  pointer: RenderElement
  inner: { name: string; node: RenderElement }[]
  fault: RenderElement
}

/**
 * Each theme key beside the hex it drew on the dark theme, shot 2026-10-17
 * (docs/palette.md). The hex swatch leads its row, so on another theme a key
 * that draws something else shows it at once.
 */
const THEME_GROUPS: readonly [string, readonly ThemeKey[]][] = [
  ['#f0efec', ['text']],
  ['#c3c2b7', ['inactive']],
  ['#898781', ['subtle']],
  ['#0b0b0b', ['inverseText']],
  ['#0ca30c', ['success', 'planMode']],
  ['#ec7e7e', ['error']],
  ['#db9300', ['warning']],
  ['#b796ff', ['merged']],
  ['#a096eb', ['autoAccept']],
  ['#c6613f', ['claude']],
  ['#ff0087', ['bashBorder']],
  ['#484847', ['promptBorder']],
  ['#32d74b', ['diffAdded', 'diffAddedWord']],
  ['#ff2c56', ['diffRemoved', 'diffRemovedWord']],
  ['#1f4023', ['diffAddedDimmed']],
  ['#481e25', ['diffRemovedDimmed']],
  // Last: a group of more than two keys takes the whole row, so its keys stay on one line.
  ['#6da7ec', ['suggestion', 'remember', 'permission', 'ide']],
]

const SIGNALS: readonly [string, string][] = [
  ['RECOMMENDED', RECOMMENDED], ['SIGNAL_BLUE', SIGNAL_BLUE], ['SIGNAL_YELLOW', SIGNAL_YELLOW], ['SIGNAL_RED', SIGNAL_RED],
  ['CARD_LINE', CARD_LINE], ['FILL', FILL], ['REST_LINE', REST_LINE], ['QUIET', QUIET],
]

/** Every wrap mode, and what the desktop does where it differs from the name. */
const WRAPS: readonly [NonNullable<TextProps['wrap']>, string?][] = [
  ['wrap'], ['end'], ['middle', 'cuts the end'], ['truncate'], ['truncate-start', 'cuts the end'], ['truncate-middle', 'cuts the end'], ['truncate-end'],
]

const SIZES: readonly NonNullable<TextProps['size']>[] = ['caption', 'footnote', 'body', 'heading', 'title']

const WEIGHTS: readonly NonNullable<TextProps['weight']>[] = ['regular', 'medium', 'semibold', 'bold']

const SPACES: readonly Space[] = [1, 'xs', 'sm', 'md', 'lg', 'xl']

/** Every border name, and the look the desktop gives the four it does not draw its own way. */
const BORDERS: readonly [string, string?][] = [
  ['single'], ['double'], ['round'], ['bold'], ['singleDouble', 'as single'], ['doubleSingle', 'as single'], ['classic', 'as single'], ['arrow', 'as single'],
]

const LONG = 'One long sentence that does not fit the narrow column it is drawn in, so the mode decides.'

/** A 4×4 PNG of the four signals, for the bitmap inside an Svg. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAI0lEQVR4nGOYdq+xccO9e4ca77U0MsBZQFEGOAsoygBnAUUBRWkgIQTcBKkAAAAASUVORK5CYII='

const FONT = 'font-family="-apple-system, system-ui, sans-serif"'
const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="200" height="64" viewBox="0 0 200 64">${body}</svg>`

/** CSS :hover on the outline, a `<title>` tooltip, and two sizes and weights of type. */
const HOVER_SVG = svg(
  `<style>.k{fill:${FILL};stroke:${REST_LINE};stroke-width:1}.k:hover{stroke:${SIGNAL_BLUE};stroke-width:3}</style>` +
    `<rect class="k" x="2" y="2" width="196" height="60" rx="8"><title>A title tooltip</title></rect>` +
    `<text x="12" y="28" ${FONT} font-size="16" font-weight="700" fill="#ecebe8" pointer-events="none">:hover, outline blue</text>` +
    `<text x="12" y="48" ${FONT} font-size="11" fill="${QUIET}" pointer-events="none">and its title is a tooltip</text>`,
)

/** A dot SMIL moves across and back. */
const SMIL_SVG = svg(
  `<rect x="2" y="2" width="196" height="60" rx="8" fill="${FILL}" stroke="${REST_LINE}"/>` +
    `<text x="12" y="22" ${FONT} font-size="11" fill="${QUIET}">SMIL</text>` +
    `<circle cx="20" cy="42" r="7" fill="${RECOMMENDED}"><animate attributeName="cx" values="20;180;20" dur="3s" repeatCount="indefinite"/></circle>`,
)

/** The PNG twice, by `href` and by `xlink:href`, scaled up with its pixels kept. */
const BITMAP_SVG = svg(
  `<rect x="2" y="2" width="196" height="60" rx="8" fill="${FILL}" stroke="${REST_LINE}"/>` +
    `<image href="${PNG}" x="10" y="8" width="48" height="48" style="image-rendering:pixelated"/>` +
    `<text x="64" y="36" ${FONT} font-size="11" fill="${QUIET}">href</text>` +
    `<image xlink:href="${PNG}" x="104" y="8" width="48" height="48" style="image-rendering:pixelated"/>` +
    `<text x="158" y="36" ${FONT} font-size="11" fill="${QUIET}">xlink</text>`,
)

const SOURCE = [
  '/** The agent: working, or what it is on. */',
  "export const SIGNAL_BLUE = '#81b0de'",
  '/** You: what waits on the person. */',
  "export const SIGNAL_YELLOW = '#dec281'",
].join('\n')

const DIFF = [
  '@@ -1,4 +1,4 @@',
  ' /** The agent: working, or what it is on. */',
  "-export const SIGNAL_BLUE = '#81b0de'",
  "+export const SIGNAL_BLUE = '#7fb2e5'",
  ' /** You: what waits on the person. */',
].join('\n')

const PRESSABLE = 'https://github.com/Leit-motif/claude-vantage-point#readme'

const MARKDOWN = [
  'A reply\'s own text: **bold**, *italic*, `code`, a [link the plugin answers](' + PRESSABLE + ') and a [link the app opens](https://github.com/Leit-motif/claude-vantage-point).',
  '',
  '- a list item',
  '- another',
  '',
  '| Element | Takes a click |',
  '| --- | --- |',
  '| Box | no |',
  '| Button | yes |',
  '',
  '```ts',
  "const scope = 'palette-scope'",
  '```',
].join('\n')

/** The cell each Button specimen takes, so their notes start on one column. */
const BUTTON_CELL = 22

/**
 * Whether the engine takes the props new in 2.1.299: Text's `size`, `weight`,
 * `mono` and `tabular`, and the spacing steps `xs` to `xl`. An older one refuses
 * the whole pane over one of them (docs/palette.md). `base` is
 * `$.session.version()`'s, absent when the version is not a release's.
 */
export function takesNewProps(base: string | undefined): boolean {
  const [, major = '', minor = '', patch = ''] = /^(\d+)\.(\d+)\.(\d+)/.exec(base ?? '') ?? []
  const at = (a: string, b: string, c: string) => Number(a) * 1e8 + Number(b) * 1e4 + Number(c)
  return major !== '' && at(major, minor, patch) >= at('2', '1', '299')
}

export function palette(el: PaletteElements, held: HumanQueuePalette, acts: PaletteActs, clients: PaletteClients, engine: { version: string; newProps: boolean }): RenderElement {
  const { Box, Text, Button, Input, Select, Svg, Link, Markdown, Code } = el

  /**
   * A specimen's name in a fixed dim column, the specimen beside it, and a dim
   * note after it where the desktop draws something other than the name says.
   * Names sit on the specimen's first line; `control` centres them on a control's height.
   * `width` holds the specimen to a fixed cell, so the notes of a page share one column.
   */
  const row = (key: string, name: string, specimen: RenderElement, note?: string, control?: true, width?: number) => (
    <Box key={key} flexDirection="row" alignItems={control ? 'center' : 'flex-start'} columnGap={2}>
      <Box width={16} flexShrink={0}>
        <Text dimColor wrap="truncate-end">
          {name}
        </Text>
      </Box>
      <Box flexDirection="row" alignItems={control ? 'center' : 'flex-start'} columnGap={2} flexShrink={1} minWidth={0}>
        {width === undefined ? specimen : <Box width={width} flexShrink={0}>{specimen}</Box>}
        {note === undefined ? null : <Text dimColor>{note}</Text>}
      </Box>
    </Box>
  )
  const section = (key: string, title: string, ...children: RenderElement[]) => (
    <Box key={key} flexDirection="column" rowGap={1} flexShrink={0}>
      <Text bold>{title}</Text>
      {children}
    </Box>
  )
  const swatch = (color: string) => <Text backgroundColor={color}>{'    '}</Text>
  const press = (what: string) => () => acts.log(`press ${what}`)

  const pages: Record<HumanQueuePalettePage, () => RenderElement[]> = {
    text: () => [
      section(
        'text-style',
        'Style',
        row('style-plain', 'plain', <Text>The quick brown fox</Text>),
        row('style-dim', 'dimColor', <Text dimColor>The quick brown fox</Text>),
        row('style-italic', 'italic', <Text italic>The quick brown fox</Text>),
        row('style-underline', 'underline', <Text underline>The quick brown fox</Text>),
        row('style-strike', 'strikethrough', <Text strikethrough>The quick brown fox</Text>),
        row('style-inverse', 'inverse', <Text inverse>The quick brown fox</Text>),
        row('style-all', 'italic underline', <Text italic underline>The quick brown fox</Text>),
        row('style-glyphs', 'glyphs', <Text>{'← → ◀ ▶ ● ◎ ◉ ⊙ ✓ ✕ ▸ ◆ █ ░'}</Text>),
      ),
      section(
        'text-wrap',
        'Wrap, in 28 columns',
        ...WRAPS.map(([wrap, note]) =>
          row(
            `wrap-${wrap}`,
            wrap,
            <Box width={28} flexShrink={0}>
              <Text wrap={wrap}>{LONG}</Text>
            </Box>,
            note,
          ),
        ),
      ),
    ],

    type: () => engine.newProps ? [
      section('type-size', 'Size', ...SIZES.map(size => row(`size-${size}`, size, <Text size={size}>The quick brown fox</Text>, undefined, size === 'title' || undefined))),
      section(
        'type-weight',
        'Weight',
        ...WEIGHTS.map(weight => row(`weight-${weight}`, weight, <Text weight={weight}>The quick brown fox</Text>, weight === 'bold' ? 'barely heavier than semibold' : undefined)),
        row('weight-bold-prop', 'bold (older prop)', <Text bold>The quick brown fox</Text>, 'draws as semibold'),
        row('weight-title', 'title semibold', <Text size="title" weight="semibold">The quick brown fox</Text>, undefined, true),
      ),
      section(
        'type-face',
        'Mono and tabular',
        row('face-mono', 'mono', <Text mono>const scope = 'palette-scope'</Text>),
        row(
          'face-tabular',
          'tabular',
          <Box key="tabular-pair" flexDirection="column">
            <Text tabular>1111.11 · 12:01:11</Text>
            <Text tabular>8888.88 · 18:08:48</Text>
          </Box>,
        ),
        row(
          'face-proportional',
          'proportional',
          <Box key="proportional-pair" flexDirection="column">
            <Text>1111.11 · 12:01:11</Text>
            <Text>8888.88 · 18:08:48</Text>
          </Box>,
        ),
      ),
    ] : [
      section(
        'type-engine',
        'Size, weight, mono and tabular',
        <Box key="type-refused">
          <Text dimColor>{`Claude Code ${engine.version} refuses these Text props, and the whole pane for one of them; 2.1.299 draws them.`}</Text>
        </Box>,
      ),
    ],

    colour: () => [
      section(
        'colour-theme',
        'Theme keys, after the hex each drew on the dark theme',
        <Box key="theme-groups" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {THEME_GROUPS.map(([hex, keys]) => (
            <Box key={`theme-${hex.slice(1)}`} width={keys.length > 2 ? '100%' : 50} flexDirection="row" alignItems="flex-start" columnGap={2}>
              <Box width={14} flexDirection="row" columnGap={1} flexShrink={0}>
                {swatch(hex)}
                <Text dimColor>{hex}</Text>
              </Box>
              <Box flexDirection="row" flexWrap="wrap" columnGap={2} flexShrink={1} minWidth={0}>
                {keys.map(key => (
                  <Box key={`theme-${key}`} flexDirection="row" columnGap={1}>
                    {swatch(key)}
                    <Text>{key}</Text>
                  </Box>
                ))}
              </Box>
            </Box>
          ))}
        </Box>,
      ),
      section(
        'colour-hex',
        'Hex, hooks/signal.ts',
        <Box key="hex-keys" flexDirection="row" flexWrap="wrap" columnGap={2}>
          {SIGNALS.map(([name, hex]) => (
            <Box key={`hex-${name}`} width={30} flexDirection="row" columnGap={1}>
              {swatch(hex)}
              <Text dimColor>{`${hex} ${name}`}</Text>
            </Box>
          ))}
        </Box>,
      ),
      section(
        'colour-back',
        'Background, and a colour by name',
        row('back-key', 'background key', <Text backgroundColor="suggestion" color="inverseText"> suggestion </Text>),
        row('back-hex', 'background hex', <Text backgroundColor={FILL}> {FILL} </Text>),
        row('back-name', 'color by name', <Text color="red">red</Text>, "the app's own red"),
      ),
    ],

    button: () => [
      section(
        'button-kinds',
        'One of each prop',
        row('button-default', 'default', <Button key="b-default" label="Default" onPress={press('default')} />, undefined, true, BUTTON_CELL),
        row('button-primary', 'primary', <Button key="b-primary" variant="primary" label="Primary" onPress={press('primary')} />, undefined, true, BUTTON_CELL),
        row('button-secondary', 'secondary', <Button key="b-secondary" variant="secondary" label="Secondary" onPress={press('secondary')} />, undefined, true, BUTTON_CELL),
        row('button-dim', 'dimColor', <Button key="b-dim" dimColor label="Dim" onPress={press('dim')} />, undefined, true, BUTTON_CELL),
        row('button-plain', 'plain', <Button key="b-plain" plain label="Plain" onPress={press('plain')} />, undefined, true, BUTTON_CELL),
        row('button-glyph', 'plain, one glyph', <Button key="b-glyph" plain label="↻" onPress={press('glyph')} />, undefined, true, BUTTON_CELL),
        row('button-hotkey', 'hotkey x', <Button key="b-hotkey" hotkey="x" label="Hotkey" onPress={press('hotkey')} />, undefined, true, BUTTON_CELL),
        row(
          'button-children',
          'Text children',
          <Button key="b-children" onPress={press('children')}>
            Children <Text color={SIGNAL_BLUE}>blue</Text> <Text dimColor>dim</Text>
          </Button>,
          'drawn white',
          true,
          BUTTON_CELL,
        ),
        row(
          'button-hover',
          'hover, yellow',
          <Box key="b-hover-scope">
            <Button key="b-hover" label="Point at me" hover={{ color: SIGNAL_YELLOW }} onPress={press('hover')} />
          </Box>,
          undefined,
          true,
          BUTTON_CELL,
        ),
        row('button-focus', 'autoFocus', <Button key="b-focus" autoFocus label="autoFocus" onPress={press('autofocus')} />, 'no ring, and Enter does nothing', true, BUTTON_CELL),
        row('button-dismiss', 'role dismiss', <Button key="b-dismiss" role="dismiss" label="Dismiss" onPress={press('dismiss')} />, 'an ordinary button', true, BUTTON_CELL),
      ),
    ],

    field: () => [
      section(
        'field-input',
        'Input',
        row(
          'input-full',
          'label, Save',
          <Input
            key="i-full"
            label="Label"
            placeholder="Placeholder"
            submitLabel="Save"
            value={held.input}
            onInput={value => acts.log(`input change ${JSON.stringify(value)}`)}
            onSubmit={value => acts.input(value)}
          />,
          undefined,
          true,
        ),
        row('input-bare', 'bare', <Input key="i-bare" placeholder="No label, no submit" onSubmit={value => acts.log(`input bare ${JSON.stringify(value)}`)} />, undefined, true),
      ),
      section(
        'field-select',
        'Select',
        row(
          'select-label',
          'label',
          <Select
            key="s-label"
            label="Pick"
            options={[
              { value: 'alpha', label: 'Alpha' },
              { value: 'beta', label: 'Beta' },
              { value: 'gamma', label: 'Gamma' },
            ]}
            value={held.select}
            onSelect={value => acts.select(value)}
          />,
          undefined,
          true,
        ),
        row(
          'select-bare',
          'bare',
          <Select key="s-bare" options={[{ value: 'one' }, { value: 'two' }, { value: 'three' }]} onSelect={value => acts.log(`select bare ${value}`)} />,
          undefined,
          true,
        ),
      ),
    ],

    border: () => [
      section(
        'border-style',
        'Border style',
        <Box key="border-styles" flexDirection="row" flexWrap="wrap" alignItems="flex-start" columnGap={2} rowGap={1}>
          {BORDERS.map(([style, note]) => (
            <Box key={`border-${style}`} borderStyle={style} paddingX={1} width={26}>
              <Text>{style}</Text>
              {note === undefined ? null : <Text dimColor>{` ${note}`}</Text>}
            </Box>
          ))}
        </Box>,
      ),
      section(
        'border-colour',
        'Border colour and fill',
        <Box key="border-colours" flexDirection="row" flexWrap="wrap" alignItems="flex-start" columnGap={2} rowGap={1}>
          <Box key="bc-key" borderStyle="round" borderColor="suggestion" paddingX={1} width={18}>
            <Text>theme key</Text>
          </Box>
          <Box key="bc-hex" borderStyle="round" borderColor={SIGNAL_BLUE} paddingX={1} width={18}>
            <Text>hex</Text>
          </Box>
          <Box key="bc-dim" borderStyle="round" borderColor={SIGNAL_BLUE} borderDimColor paddingX={1} width={18}>
            <Text>borderDimColor</Text>
          </Box>
          <Box key="bg-both" borderStyle="round" borderColor={CARD_LINE} backgroundColor={FILL} paddingX={1} width={18}>
            <Text>fill and border</Text>
          </Box>
          <Box key="bg-fill" backgroundColor={FILL} paddingX={1} width={18}>
            <Text>fill, no border</Text>
          </Box>
          <Box key="bg-key" backgroundColor="suggestion" paddingX={1} width={18}>
            <Text color="inverseText">fill, theme key</Text>
          </Box>
        </Box>,
      ),
      section(
        'border-space',
        'Gap and padding, in cells or a step',
        ...SPACES.filter(space => engine.newProps || typeof space === 'number').map(space =>
          row(
            `space-${space}`,
            `gap ${space}`,
            <Box key={`gap-${space}`} flexDirection="row" columnGap={space}>
              {swatch(QUIET)}
              {swatch(QUIET)}
              {swatch(QUIET)}
            </Box>,
          ),
        ),
        row(
          'space-buttons',
          'Buttons, no gap',
          <Box key="gap-buttons" flexDirection="row">
            <Button key="gap-one" label="One" onPress={press('gap one')} />
            <Button key="gap-two" label="Two" onPress={press('gap two')} />
          </Box>,
          'they touch',
          true,
        ),
        engine.newProps
          ? row(
              'space-padding',
              'padding md',
              <Box key="pad-md" padding="md" backgroundColor={FILL}>
                <Text>inside padding md</Text>
              </Box>,
            )
          : row('space-steps', 'steps', <Text dimColor>{`Claude Code ${engine.version} refuses xs to xl; 2.1.299 takes them.`}</Text>),
      ),
    ],

    hover: () => [
      section(
        'hover-box',
        'Box hover, point at each',
        <Box key="hover-border" borderStyle="round" borderColor={REST_LINE} hover={{ borderColor: SIGNAL_BLUE }} paddingX={1}>
          <Text>The border turns blue</Text>
        </Box>,
        <Box key="hover-style" borderStyle="round" borderColor={REST_LINE} hover={{ borderStyle: 'double' }} paddingX={1}>
          <Text>
            A hover borderStyle of double <Text dimColor>changes nothing</Text>
          </Text>
        </Box>,
        <Box key="hover-fill" paddingX={1} hover={{ backgroundColor: FILL }}>
          <Text>The background fills</Text>
        </Box>,
        <Box key="hover-text" paddingX={1}>
          <Text hover={{ color: SIGNAL_YELLOW, underline: true }}>The text turns yellow and underlined</Text>
        </Box>,
        <Box key="hover-reveal" flexDirection="row" paddingX={1} columnGap={1}>
          <Text>A word appears after this:</Text>
          <Box display="none" hover={{ display: 'flex' }}>
            <Text color={RECOMMENDED}>revealed</Text>
          </Box>
        </Box>,
        <Box key="hover-pop" flexDirection="column" paddingX={1}>
          <Text>A popover opens over the two rows below</Text>
          <Box position="absolute" top={1} left={0} display="none" hover={{ display: 'flex' }} borderStyle="round" borderColor={SIGNAL_BLUE} backgroundColor={FILL} paddingX={1}>
            <Box flexDirection="column">
              <Text>the popover, placed absolute,</Text>
              <Text>over both rows below</Text>
            </Box>
          </Box>
        </Box>,
        <Box key="hover-under" flexDirection="column" paddingX={1}>
          <Text dimColor>row one under the popover</Text>
          <Text dimColor>row two under the popover</Text>
        </Box>,
      ),
      section(
        'hover-scope',
        `One scope, ${SCOPE}: both rows, and the ◆ mark on the command's row in the transcript`,
        <Box key="scope-a" borderStyle="round" borderColor={REST_LINE} hover={{ scope: SCOPE, borderColor: SIGNAL_YELLOW }} paddingX={1}>
          <Text hover={{ scope: SCOPE, color: SIGNAL_YELLOW }}>Scope member A</Text>
        </Box>,
        <Box key="scope-gap" paddingX={1}>
          <Text dimColor>not in the scope</Text>
        </Box>,
        <Box key="scope-b" borderStyle="round" borderColor={REST_LINE} hover={{ scope: SCOPE, borderColor: SIGNAL_YELLOW }} paddingX={1}>
          <Text hover={{ scope: SCOPE, color: SIGNAL_YELLOW }}>Scope member B</Text>
        </Box>,
      ),
    ],

    svg: () => [
      section(
        'svg-pairs',
        'Plain on the left, isInteractive on the right',
        ...(
          [
            ['hover', HOVER_SVG, ':hover and a title', 'only the interactive one answers'],
            ['smil', SMIL_SVG, 'SMIL motion', 'both move'],
            ['bitmap', BITMAP_SVG, 'a data-URI PNG', 'the interactive one draws no PNG'],
          ] as const
        ).map(([key, source, alt, note]) => (
          <Box key={`svg-${key}`} flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={2} rowGap={1}>
            <Svg key={`svg-${key}-plain`} source={source} alt={`${alt}, plain`} width={200} height={64} />
            <Svg key={`svg-${key}-live`} source={source} alt={`${alt}, interactive`} width={200} height={64} isInteractive />
            <Text dimColor>{note}</Text>
          </Box>
        )),
      ),
    ],

    rich: () => [
      section(
        'rich-link',
        'Link',
        row('link-label', 'label', <Link href="https://github.com/Leit-motif/claude-vantage-point" label="Vantage Point on GitHub" />),
        row(
          'link-children',
          'Text children',
          <Link href="https://github.com/Leit-motif/claude-vantage-point/issues/47">
            issue <Text color={SIGNAL_YELLOW}>#47</Text>
          </Link>,
          'the child keeps its colour',
        ),
      ),
      section(
        'rich-markdown',
        'Markdown, onLinkPress on the first link',
        <Markdown key="md-press" text={MARKDOWN} pressableLinks={[PRESSABLE]} onLinkPress={link => acts.log(`link ${link.href}`)} />,
        <Markdown key="md-dim" dimColor text="The same renderer drawn dimColor, as an aside." />,
      ),
      section(
        'rich-code',
        'Code with a gutter from line 12, and a diff drawn as plain code',
        <Code key="code-gutter" source={SOURCE} language="typescript" startLine={12} />,
        <Code key="code-diff" source={DIFF} format="diff" path="hooks/signal.ts" />,
      ),
    ],

    pointer: () => [
      section('pointer-client', 'Client, every pointer event and key with its cell', clients.pointer),
      section(
        'pointer-inner',
        'One Client per element it may draw',
        ...clients.inner.map(({ name, node }) =>
          row(`inner-row-${name}`, name, node, undefined, true),
        ),
        row('fault-row', 'render loop', clients.fault),
      ),
    ],
  }

  return (
    <Box key="palette" flexDirection="column" rowGap={1} paddingX={1}>
      <Box key="palette-pages" flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1} flexShrink={0}>
        {PAGES.map((page, i) => (
          <Button
            key={`page-${page.key}`}
            hotkey={String((i + 1) % 10)}
            label={page.name}
            {...(page.key === held.page ? {} : { dimColor: true })}
            onPress={() => acts.page(page.key)}
          />
        ))}
      </Box>
      <Box key="palette-log" flexShrink={0}>
        <Text dimColor wrap="truncate-end">
          {held.log[0] ?? 'Press, type or pick anything: the last one shows here.'}
        </Text>
      </Box>
      {pages[held.page]()}
    </Box>
  )
}
