// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { ElevationProfile } from './elevation-profile';
import { summarizeElevation } from '../lib/elevation';

afterEach(cleanup);
describe('elevation profile', () => {
  it('shows climb/descent estimates and lets keyboard controls inspect samples', () => {
    render(
      <ElevationProfile
        elevation={summarizeElevation([0, 500, 1000], [100, 150, 125])}
      />,
    );
    expect(
      screen.getByRole('img', { name: 'Route elevation profile' }),
    ).toBeVisible();
    expect(screen.getByText('50 m')).toBeVisible();
    expect(screen.getByText('25 m')).toBeVisible();
    const slider = screen.getByRole('slider');
    fireEvent.change(slider, { target: { value: '2' } });
    expect(slider).toHaveAttribute(
      'aria-valuetext',
      '1.00 km, 125 metres elevation',
    );
    expect(screen.getByText('1.00 km · 125 m elevation')).toBeVisible();
  });
  it('draws separate lines across data gaps and withholds full-route totals', () => {
    const { container } = render(
      <ElevationProfile
        elevation={summarizeElevation(
          [0, 30, 60, 90, 120],
          [100, 110, null, 130, 125],
        )}
      />,
    );
    expect(
      screen.getByText(/Partial elevation coverage: 4 of 5/),
    ).toBeVisible();
    expect(screen.getAllByText('Unknown')).toHaveLength(2);
    expect(container.querySelectorAll('polyline')).toHaveLength(2);
  });
  it('distinguishes missing elevation from zero ascent on a flat route', () => {
    const { rerender } = render(<ElevationProfile elevation={undefined} />);
    expect(screen.getByText(/Ascent and descent are unknown/)).toBeVisible();
    expect(screen.queryByRole('img')).toBeNull();
    rerender(
      <ElevationProfile elevation={summarizeElevation([0, 30], [0, 0])} />,
    );
    expect(screen.getByRole('img')).toBeVisible();
    expect(screen.queryByText(/unknown/)).toBeNull();
  });

  it('lists sustained climbs with the approximate grade and route range', () => {
    render(
      <ElevationProfile
        elevation={summarizeElevation([0, 30, 60, 90], [100, 103, 106, 109])}
      />,
    );
    const climb = screen.getByText('Climb · +10.0%');
    expect(climb.closest('li')).toHaveTextContent('0.00–0.09 km');
  });

  it('reports when complete elevation data has no sustained steep sections', () => {
    render(
      <ElevationProfile
        elevation={summarizeElevation([0, 30, 60], [100, 101, 100])}
      />,
    );
    expect(
      screen.getByText('No sustained steep sections detected.', {
        exact: true,
      }),
    ).toHaveTextContent('No sustained steep sections detected.');
  });
});
