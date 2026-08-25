import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Button, IconButton } from '../../src/renderer/components/ui/Button'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key === 'common:loading' ? '加载中...' : key,
  }),
}))

describe('Button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders children and forwards native props', () => {
    const onClick = vi.fn()

    render(
      <Button type="submit" data-testid="save-button" onClick={onClick}>
        保存
      </Button>
    )

    const button = screen.getByTestId('save-button')
    expect(button).toHaveAttribute('type', 'submit')
    expect(button).toHaveTextContent('保存')

    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('disables itself and shows translated loading text while loading', () => {
    render(<Button loading>保存</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('加载中...')
    expect(button.querySelector('svg')).not.toBeNull()
  })

  it('honors explicit disabled state', () => {
    const onClick = vi.fn()
    render(<Button disabled onClick={onClick}>删除</Button>)

    const button = screen.getByRole('button')
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('renders an accessible label for icon buttons', () => {
    render(<IconButton label="关闭">×</IconButton>)

    expect(screen.getByRole('button', { name: '关闭' })).toHaveTextContent('×')
  })
})
