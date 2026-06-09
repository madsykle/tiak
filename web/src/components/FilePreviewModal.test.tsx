import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FilePreviewModal from './FilePreviewModal';

// Mock dynamic import
jest.mock('next/dynamic', () => ({
  __esModule: true,
  default: () => {
    return function MockComponent() {
      return <div data-testid="mock-video-player">Video Player Mock</div>;
    };
  },
}));

describe('FilePreviewModal', () => {
  const mockFile = {
    path: '/test/video.mp4',
    name: 'video.mp4',
    size: 1048576, // 1 MB
    category: 'travel',
  };

  const mockOnClose = jest.fn();
  const mockOnPrev = jest.fn();
  const mockOnNext = jest.fn();
  const mockOnTogglePlayerType = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders file details correctly', () => {
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    expect(screen.getByText('video.mp4')).toBeTruthy();
    expect(screen.getByText('travel • 1 MB')).toBeTruthy();
  });

  it('calls onClose when backdrop is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    // Find the backdrop by its class or container
    const backdrop = screen.getByText('video.mp4').closest('div[class*="fixed inset-0"]');
    if (backdrop) {
      await user.click(backdrop);
    }
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when close button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    // The close button is the first button in the document
    const buttons = screen.getAllByRole('button');
    const closeButton = buttons[0];
    await user.click(closeButton);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    await user.keyboard('{Escape}');
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it('calls onPrev when previous button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={true}
        hasNext={false}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    const prevButton = screen.getByRole('button', { name: /previous/i });
    await user.click(prevButton);
    expect(mockOnPrev).toHaveBeenCalledTimes(1);
  });

  it('calls onNext when next button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    const nextButton = screen.getByRole('button', { name: /next/i });
    await user.click(nextButton);
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('calls onPrev when left arrow key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={true}
        hasNext={false}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    await user.keyboard('{ArrowLeft}');
    expect(mockOnPrev).toHaveBeenCalledTimes(1);
  });

  it('calls onNext when right arrow key is pressed', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    await user.keyboard('{ArrowRight}');
    expect(mockOnNext).toHaveBeenCalledTimes(1);
  });

  it('disables previous button when hasPrev is false', () => {
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    const prevButton = screen.getByRole('button', { name: /previous/i });
    expect(prevButton).toBeDisabled();
  });

  it('disables next button when hasNext is false', () => {
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={true}
        hasNext={false}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    const nextButton = screen.getByRole('button', { name: /next/i });
    expect(nextButton).toBeDisabled();
  });

  it('calls onTogglePlayerType when player toggle button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /switch to native player/i });
    await user.click(toggleButton);
    expect(mockOnTogglePlayerType).toHaveBeenCalledTimes(1);
  });

  it('shows correct toggle button label for custom player', () => {
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="custom"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    expect(screen.getByRole('button', { name: /switch to native player/i })).toBeInTheDocument();
  });

  it('shows correct toggle button label for native player', () => {
    render(
      <FilePreviewModal
        file={mockFile}
        src="http://test.com/video.mp4"
        playerType="native"
        hasPrev={false}
        hasNext={true}
        onClose={mockOnClose}
        onPrev={mockOnPrev}
        onNext={mockOnNext}
        onTogglePlayerType={mockOnTogglePlayerType}
      />
    );

    expect(screen.getByRole('button', { name: /switch to custom player/i })).toBeInTheDocument();
  });
});