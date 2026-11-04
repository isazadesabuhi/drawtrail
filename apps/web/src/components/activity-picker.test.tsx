// @vitest-environment jsdom
import React from 'react';
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ActivityPicker } from './activity-picker';

afterEach(cleanup);

it('changes the selected activity and its description with accessible radio controls', () => {
  render(<ActivityPicker />);
  expect(screen.getByRole('radio', { name: 'Walk' })).toBeChecked();
  fireEvent.click(screen.getByRole('radio', { name: 'Ride' }));
  expect(screen.getByRole('radio', { name: 'Ride' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Walk' })).not.toBeChecked();
  expect(screen.getByRole('status')).toHaveTextContent('two wheels');
});
