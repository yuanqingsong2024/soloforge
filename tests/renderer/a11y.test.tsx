import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  LiveRegion,
  SkipLink,
  VisuallyHidden,
  buttonA11y,
  fieldId,
  listA11y,
  listItemA11y,
  loadingA11y,
  regionA11y,
} from '../../src/renderer/components/a11y'

describe('accessibility utilities', () => {
  it('creates stable aria attributes', () => {
    expect(buttonA11y('保存')).toEqual({ 'aria-label': '保存' })
    expect(regionA11y('主要内容')).toEqual({ 'aria-label': '主要内容', role: 'region' })
    expect(listA11y('工单列表', 3)).toEqual({ 'aria-label': '工单列表', role: 'list', 'aria-listcount': 3 })
    expect(listItemA11y()).toEqual({ role: 'listitem' })
    expect(loadingA11y('正在加载')).toEqual({
      'aria-label': '正在加载',
      'aria-busy': true,
      'aria-live': 'polite',
    })
  })

  it('normalizes field labels into deterministic ids', () => {
    expect(fieldId('Workspace Name')).toBe('field-workspace-name')
    expect(fieldId('  Retry  Count ')).toBe('field--retry-count-')
  })

  it('renders skip links, hidden content, and live regions', () => {
    render(
      <>
        <SkipLink to="#main">跳转到主要内容</SkipLink>
        <VisuallyHidden>屏幕阅读器文本</VisuallyHidden>
        <LiveRegion politeness="assertive">状态已更新</LiveRegion>
      </>
    )

    expect(screen.getByRole('link', { name: '跳转到主要内容' })).toHaveAttribute('href', '#main')
    expect(screen.getByText('屏幕阅读器文本')).toHaveClass('sr-only')
    expect(screen.getByText('状态已更新')).toHaveAttribute('aria-live', 'assertive')
  })
})
