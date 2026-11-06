/** リフト券＋レンタル（セット券を使うならそれ）の合計を出す共通部品。test() は含めない */
import type { LiftTicketData, TicketDayDuration } from "../../types";
import { calculateLiftTicketPlan } from "../calculateLiftTicket";
import { calculateRentalPlan } from "../rental";
import { calculateRentalBundle } from "../rentalBundle";
import { DAY, dayInput, party, type SpecMember } from "../testing/specResort";

export const withRental = (
  data: LiftTicketData,
  date: string,
  members: SpecMember[],
  options: { today?: string; duration?: TicketDayDuration } = {},
) => {
  const input = dayInput(
    date,
    options.duration ?? DAY,
    party(...members),
    options.today,
  );
  const plan = calculateLiftTicketPlan(data, input);
  const rental = calculateRentalPlan(data, input);
  const bundle = calculateRentalBundle(data, input, plan, rental);
  return { plan, rental, bundle };
};

/** セット券を使うなら bundle.total（使わない人・日の分を含む全体）、使わないなら別々の合計 */
export const grandTotal = (result: ReturnType<typeof withRental>) => {
  const { plan, rental, bundle } = result;
  if (bundle && bundle.lines.length > 0 && bundle.total != null) {
    return bundle.total;
  }
  return (plan.total ?? 0) + (rental.total ?? 0);
};
