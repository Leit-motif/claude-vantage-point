// The public copy's mock album. The internal repository draws every technique
// on a real ask from a private project; the public copy ships this page in its
// place, with the same exports, so register.tsx is the same file in both.
import type { BoxProps, ButtonProps, ElementConstructor, LinkProps, MarkdownProps, RenderElement, SelectProps, SvgProps, TextProps } from 'claude-code'
import type { HumanQueueAlbum, HumanQueueAlbumPage } from '../types'
import type { Facts } from '../panes/visuals/facts'

type Page = { key: HumanQueueAlbumPage; name: string }

export const ALBUM_PAGES: readonly Page[] = [{ key: 'before', name: 'The album' }]

export const ALBUM_START: HumanQueueAlbum = { page: 'before', scenario: 'set-aside' }

export type AlbumElements = {
  Box: ElementConstructor<BoxProps>
  Text: ElementConstructor<TextProps>
  Button: ElementConstructor<ButtonProps>
  Select: ElementConstructor<SelectProps>
  Svg: ElementConstructor<SvgProps>
  Link: ElementConstructor<LinkProps>
  Markdown: ElementConstructor<MarkdownProps>
}

export type AlbumActs = {
  page: (page: HumanQueueAlbumPage) => Promise<void>
  scenario: (scenario: HumanQueueAlbum['scenario']) => Promise<void>
}

export function album(
  el: AlbumElements,
  _held: HumanQueueAlbum,
  _acts: AlbumActs,
  _glossary: (terms: Required<Facts>['terms']) => RenderElement,
  _room: number,
  _newProps: boolean,
): RenderElement {
  const { Box, Text } = el
  return (
    <Box flexDirection="column" rowGap={1}>
      <Text>The album is a design tool of the plugin's own development and is not part of this copy.</Text>
      <Text dimColor>Open the tour with /vantage-point tour to try every feature.</Text>
    </Box>
  )
}
