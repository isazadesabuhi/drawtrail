// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { MovingTimeEstimate } from './moving-time-estimate';

afterEach(cleanup);

describe('moving time estimate', () => {
  it('updates time when the selected route distance changes', () => {
    const { rerender } = render(
      <MovingTimeEstimate mode="walking" distanceMeters={5000} />,
    );
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('50 min');
    rerender(<MovingTimeEstimate mode="walking" distanceMeters={10000} />);
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('1 hr 40 min');
  });

  it('keeps activity units explicit and rejects an invalid user rate', () => {
    const { rerender } = render(
      <MovingTimeEstimate mode="running" distanceMeters={5000} />,
    );
    expect(screen.getByLabelText('Running pace (min/km)')).toHaveValue(6);
    rerender(<MovingTimeEstimate mode="cycling" distanceMeters={5000} />);
    const input = screen.getByLabelText('Cycling speed (km/h)');
    expect(input).toHaveValue(18);
    fireEvent.change(input, { target: { value: '0' } });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('Check your pace or speed');
  });

  it('estimates cycling time from speed in km/h', () => {
    render(<MovingTimeEstimate mode="cycling" distanceMeters={10000} />);
    fireEvent.change(screen.getByLabelText('Cycling speed (km/h)'), {
      target: { value: '20' },
    });
    expect(
      screen.getByRole('status', { name: 'Estimated moving time' }),
    ).toHaveTextContent('30 min');
    expect(screen.getByText(/Stops are not included/)).toBeVisible();
  });
});
