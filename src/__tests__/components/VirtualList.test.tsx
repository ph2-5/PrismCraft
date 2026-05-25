import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VirtualList } from '@/shared/presentation/VirtualList';
import { CharacterListItem } from '@/modules/character';
import { SceneListItem } from '@/modules/scene';

// Mock useVirtualList hook
vi.mock('@/shared/utils/performance', () => ({
  useVirtualList: vi.fn((items, _ref, options) => ({
    visibleItems: items,
    visibleRange: { start: 0, end: items.length },
    totalHeight: items.length * options.itemHeight,
    offsetY: 0,
  })),
}));

describe('VirtualList', () => {
  const mockItems = [
    { id: '1', name: 'Item 1', style: 'Style 1' },
    { id: '2', name: 'Item 2', style: 'Style 2' },
    { id: '3', name: 'Item 3', style: 'Style 3' },
  ];

  const renderItem = (item: typeof mockItems[0]) => (
    <div key={item.id} data-testid={`item-${item.id}`}>
      {item.name}
    </div>
  );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render empty message when no items', () => {
    render(
      <VirtualList
        items={[]}
        itemHeight={50}
        renderItem={renderItem}
        emptyMessage="No items found"
      />
    );

    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('should render all items', () => {
    render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        renderItem={renderItem}
      />
    );

    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('should apply custom className', () => {
    const { container } = render(
      <VirtualList
        items={mockItems}
        itemHeight={50}
        renderItem={renderItem}
        className="custom-class"
      />
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });
});

describe('CharacterListItem', () => {
  const mockCharacter = {
    id: '1',
    name: 'Test Character',
    style: 'Anime',
    generatedImage: 'http://example.com/image.jpg',
  };

  const mockOnClick = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render character with image', () => {
    render(
      <CharacterListItem
        character={mockCharacter}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Test Character')).toBeInTheDocument();
    expect(screen.getByText('Anime')).toBeInTheDocument();
    expect(screen.getByAltText('Test Character')).toHaveAttribute('src', mockCharacter.generatedImage);
  });

  it('should render character without image', () => {
    render(
      <CharacterListItem
        character={{ ...mockCharacter, generatedImage: undefined }}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('T')).toBeInTheDocument(); // First letter
  });

  it('should render unnamed character', () => {
    render(
      <CharacterListItem
        character={{ ...mockCharacter, name: '' }}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('未命名角色')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    render(
      <CharacterListItem
        character={mockCharacter}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Test Character').closest('div')!);
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should call onDelete when delete button clicked', () => {
    render(
      <CharacterListItem
        character={mockCharacter}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    const deleteButton = screen.getByRole('button');
    fireEvent.click(deleteButton);
    expect(mockOnDelete).toHaveBeenCalled();
  });
});

describe('SceneListItem', () => {
  const mockScene = {
    id: '1',
    name: 'Test Scene',
    type: 'City',
    generatedImage: 'http://example.com/scene.jpg',
  };

  const mockOnClick = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render scene with image', () => {
    render(
      <SceneListItem
        scene={mockScene}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('Test Scene')).toBeInTheDocument();
    expect(screen.getByText('City')).toBeInTheDocument();
    expect(screen.getByAltText('Test Scene')).toHaveAttribute('src', mockScene.generatedImage);
  });

  it('should render scene without image', () => {
    render(
      <SceneListItem
        scene={{ ...mockScene, generatedImage: undefined }}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('T')).toBeInTheDocument(); // First letter
  });

  it('should render unnamed scene', () => {
    render(
      <SceneListItem
        scene={{ ...mockScene, name: '' }}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText('未命名场景')).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    render(
      <SceneListItem
        scene={mockScene}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    fireEvent.click(screen.getByText('Test Scene').closest('div')!);
    expect(mockOnClick).toHaveBeenCalled();
  });

  it('should call onDelete when delete button clicked', () => {
    render(
      <SceneListItem
        scene={mockScene}
        onClick={mockOnClick}
        onDelete={mockOnDelete}
      />
    );

    const deleteButton = screen.getByRole('button');
    fireEvent.click(deleteButton);
    expect(mockOnDelete).toHaveBeenCalled();
  });
});
