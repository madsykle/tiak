import React from 'react';
import { render, screen } from '@testing-library/react';
import CategorySettingsSection from './CategorySettingsSection';
import userEvent from '@testing-library/user-event';

describe('CategorySettingsSection', () => {
  const mockCategories = ['default', 'travel', 'food', 'personal'];
  const mockOnNewCatNameChange = jest.fn();
  const mockOnAddCategory = jest.fn();
  const mockOnStartEditing = jest.fn();
  const mockOnEditingCatChange = jest.fn();
  const mockOnSaveRename = jest.fn();
  const mockOnDeleteCategory = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders categories list', () => {
    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    expect(screen.getByText('Categories')).toBeInTheDocument();
    expect(screen.getByText('default')).toBeInTheDocument();
    expect(screen.getByText('travel')).toBeInTheDocument();
    expect(screen.getByText('food')).toBeInTheDocument();
    expect(screen.getByText('personal')).toBeInTheDocument();

    // Default category should show "Default" label
    expect(screen.getByText('Default')).toBeInTheDocument();
  });

  it('allows adding a new category', async () => {
    const user = userEvent.setup();

    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName="new-category"
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    const input = screen.getByPlaceholderText('New Category Name');
    const addButton = screen.getByText('Add');

    // Input should have value
    expect(input).toHaveValue('new-category');

    // Add button should be enabled
    expect(addButton).not.toBeDisabled();

    // Click add button
    await user.click(addButton);
    expect(mockOnAddCategory).toHaveBeenCalledTimes(1);

    // Test Enter key
    await user.type(input, '{enter}');
    expect(mockOnAddCategory).toHaveBeenCalledTimes(2);
  });

  it('disables add button when input is empty', () => {
    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    const addButton = screen.getByText('Add');
    expect(addButton).toBeDisabled();
  });

  it('shows edit mode for a category', () => {
    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={{ original: 'travel', current: 'updated-travel' }}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    // Should show input with current value
    const input = screen.getByDisplayValue('updated-travel');
    expect(input).toBeInTheDocument();

    // Should show save and cancel buttons (they don't have accessible names)
    const saveButton = screen.getAllByRole('button')[1];
    const cancelButton = screen.getAllByRole('button')[2];
    expect(saveButton).toBeInTheDocument();
    expect(cancelButton).toBeInTheDocument();
  });

  it('allows renaming a category', async () => {
    const user = userEvent.setup();

    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={{ original: 'travel', current: 'updated-travel' }}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    const input = screen.getByDisplayValue('updated-travel');

    // Test Enter key saves
    await user.type(input, '{enter}');
    expect(mockOnSaveRename).toHaveBeenCalledTimes(1);

    // Test Escape key cancels
    mockOnEditingCatChange.mockClear();
    await user.type(input, '{escape}');
    expect(mockOnEditingCatChange).toHaveBeenCalledWith(null);
  });

  it('allows starting edit mode', async () => {
    const user = userEvent.setup();

    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    const editButtons = screen.getAllByTitle('Rename');
    await user.click(editButtons[0]); // Click first edit button (for 'travel')
    expect(mockOnStartEditing).toHaveBeenCalledWith('travel');
  });

  it('allows deleting a category', async () => {
    const user = userEvent.setup();

    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    const deleteButtons = screen.getAllByTitle('Delete');
    await user.click(deleteButtons[0]); // Click first delete button (for 'travel')
    expect(mockOnDeleteCategory).toHaveBeenCalledWith('travel');
  });

  it('does not show edit/delete buttons for default category', () => {
    render(
      <CategorySettingsSection
        categories={mockCategories}
        newCatName=""
        editingCat={null}
        onNewCatNameChange={mockOnNewCatNameChange}
        onAddCategory={mockOnAddCategory}
        onStartEditing={mockOnStartEditing}
        onEditingCatChange={mockOnEditingCatChange}
        onSaveRename={mockOnSaveRename}
        onDeleteCategory={mockOnDeleteCategory}
      />
    );

    // Find default category row
    const defaultRow = screen.getByText('default').closest('div');
    const editButtons = defaultRow?.querySelectorAll('[title="Rename"]');
    const deleteButtons = defaultRow?.querySelectorAll('[title="Delete"]');

    expect(editButtons?.length).toBe(0);
    expect(deleteButtons?.length).toBe(0);
  });
});