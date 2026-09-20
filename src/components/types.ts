import { RefurbInput, FitShoeInput, RecheckInput } from "../domain/rules";
import { ArchiveState } from "../domain/types";

export interface ArchiveApi {
  state: ArchiveState;
  fit: (input: FitShoeInput) => void;
  remove: (fittingId: string, at: string) => void;
  recheck: (input: RecheckInput) => void;
  refurb: (input: RefurbInput) => void;
}
