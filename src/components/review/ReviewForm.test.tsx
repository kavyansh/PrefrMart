import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewForm } from '@/components/review/ReviewForm';

/**
 * The form's own comment explains that its validation is a UX affordance and the server's Zod parse
 * is the trust boundary. These tests hold it to that split: they check the affordance saves a round
 * trip, and that when the server rejects something anyway, the rejection lands on the right field
 * rather than replacing the form with a banner.
 *
 * The success path deliberately calls `router.refresh()` instead of patching the page. The rating
 * average, rater count and histogram are all server-rendered, and re-rendering them together is
 * what stops the four numbers disagreeing.
 */

const refresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue(jsonResponse(201, { review: { id: 'r1' } }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function setup() {
  render(<ReviewForm productSlug="kestrel-ultra-webcam" />);
  return { user: userEvent.setup() };
}

/** Fills every field with something valid. Individual tests override one at a time. */
async function fillValidReview(
  user: ReturnType<typeof userEvent.setup>,
  { rating = 4, title = 'Sharp picture', body = 'Held up well over a month of daily calls.' } = {},
) {
  if (rating > 0) {
    await user.click(screen.getByRole('radio', { name: `${rating} stars` }));
  }
  if (title !== '') await user.type(screen.getByLabelText('Title'), title);
  if (body !== '') await user.type(screen.getByLabelText('Your review'), body);
}

const submit = (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Submit review' }));

describe('ReviewForm', () => {
  describe('the star input', () => {
    it('is a single-choice control, so arrow keys work', () => {
      setup();

      // Radios rather than a row of buttons: rating is exactly a single choice, and radios give
      // arrow-key navigation for free.
      expect(screen.getAllByRole('radio')).toHaveLength(5);
      expect(screen.getByRole('group', { name: 'Your rating' })).toBeInTheDocument();
    });

    it('names one star in the singular', () => {
      setup();

      expect(screen.getByRole('radio', { name: '1 star' })).toBeInTheDocument();
      expect(screen.getByRole('radio', { name: '2 stars' })).toBeInTheDocument();
    });

    it('records the choice', async () => {
      const { user } = setup();

      await user.click(screen.getByRole('radio', { name: '5 stars' }));

      expect(screen.getByRole('radio', { name: '5 stars' })).toBeChecked();
    });
  });

  describe('validation before submitting', () => {
    it('requires a rating', async () => {
      const { user } = setup();

      await fillValidReview(user, { rating: 0 });
      await submit(user);

      expect(screen.getByText('Choose a star rating.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('requires a title of a few characters', async () => {
      const { user } = setup();

      await fillValidReview(user, { title: 'ok' });
      await submit(user);

      expect(screen.getByText('Give your review a short title.')).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('treats a title of only spaces as empty', async () => {
      const { user } = setup();

      await fillValidReview(user, { title: '     ' });
      await submit(user);

      expect(screen.getByText('Give your review a short title.')).toBeInTheDocument();
    });

    it('asks for more than a couple of words in the body', async () => {
      const { user } = setup();

      await fillValidReview(user, { body: 'Good.' });
      await submit(user);

      expect(
        screen.getByText('Tell us a little more — at least 10 characters.'),
      ).toBeInTheDocument();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('ties each message to its field', async () => {
      const { user } = setup();

      await fillValidReview(user, { title: 'no' });
      await submit(user);

      const title = screen.getByLabelText('Title');
      expect(title).toHaveAttribute('aria-invalid', 'true');
      expect(title).toHaveAccessibleDescription('Give your review a short title.');
    });

    it('reports every problem at once rather than one per attempt', async () => {
      const { user } = setup();

      await submit(user);

      // Fixing three things across three round trips is a miserable way to leave a review.
      expect(screen.getByText('Choose a star rating.')).toBeInTheDocument();
      expect(screen.getByText('Give your review a short title.')).toBeInTheDocument();
      expect(screen.getByText('Tell us a little more — at least 10 characters.')).toBeInTheDocument();
    });
  });

  describe('the character counter', () => {
    it('starts at zero and tracks what is typed', async () => {
      const { user } = setup();

      expect(screen.getByText('0 / 4,000')).toBeInTheDocument();

      await user.type(screen.getByLabelText('Your review'), 'Twelve chars');
      expect(screen.getByText('12 / 4,000')).toBeInTheDocument();
    });

    it('caps the textarea at the same limit it advertises', () => {
      setup();

      // A counter promising 4,000 next to a field that accepts 5,000 is a trap.
      expect(screen.getByLabelText('Your review')).toHaveAttribute('maxlength', '4000');
    });
  });

  describe('a successful submission', () => {
    it('posts the trimmed review to the product it belongs to', async () => {
      const { user } = setup();

      await fillValidReview(user, { title: '  Sharp picture  ', body: '  Held up well.  ' });
      await submit(user);

      expect(fetchMock).toHaveBeenCalledWith(
        '/api/products/kestrel-ultra-webcam/reviews',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ rating: 4, title: 'Sharp picture', body: 'Held up well.' }),
        }),
      );
    });

    it('replaces the form with a confirmation, announced without stealing focus', async () => {
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      const confirmation = await screen.findByRole('status');
      expect(confirmation).toHaveTextContent('Thanks — your review is published.');
      // The form is gone, so the review cannot be submitted twice.
      expect(screen.queryByRole('button', { name: 'Submit review' })).not.toBeInTheDocument();
    });

    it('re-renders the server-side rating summary', async () => {
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      // The average, the rater count and the histogram all live in the server render. Patching them
      // on the client is how four numbers end up disagreeing.
      await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    });
  });

  describe('when the server rejects it', () => {
    it('maps a field error back onto its input', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(422, {
          error: { message: 'Check your review.', fields: { body: 'That looks like spam.' } },
        }),
      );
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      const body = await screen.findByLabelText('Your review');
      expect(body).toHaveAccessibleDescription('That looks like spam.');
      // The form stays, with what was typed still in it.
      expect(body).toHaveValue('Held up well over a month of daily calls.');
    });

    it('reports a rejection with no field attached as a form-level alert', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(409, { error: { message: 'You have already reviewed this product.' } }),
      );
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'You have already reviewed this product.',
      );
    });

    it('falls back to its own message when the server sends none', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent('Could not submit your review.');
    });

    it('distinguishes an unreachable server', async () => {
      fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Could not reach the server. Check your connection and try again.',
      );
    });

    it('leaves the form submittable again', async () => {
      fetchMock.mockResolvedValue(jsonResponse(500, {}));
      const { user } = setup();

      await fillValidReview(user);
      await submit(user);

      expect(await screen.findByRole('button', { name: 'Submit review' })).toBeEnabled();
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
  });
});
