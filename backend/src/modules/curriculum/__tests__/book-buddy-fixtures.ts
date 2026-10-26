import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Codes and ids copied from Book Buddy's backend/prisma/taxonomy/data/taxonomy_nodes.csv (release 2026.10.1).
 * Pinned here rather than read from the vendored copy, so a copy that drifted from Book Buddy's fails.
 */
export const BOOK_BUDDY_IDS: Array<[string, string]> = [
    ['SCH', '0db7030e-7502-5b02-a5e9-679fa579b987'],
    ['SCH.NIOS.SECONDARY.ENGLISH', '0c242902-3c21-51d4-affc-569b1899d6aa'],
    ['SCH.MPBSE.C5.ENGLISH', '0de98c8e-75d4-5abb-8fbd-d9c72999ec90'],
    ['SCH.HBSE.C1.HINDI', 'b38d223c-be11-5e2c-a4c5-40ca6a8dd120'],
    ['SCH.PSEB.C11.PSYCHOLOGY', '70602e0d-fb33-572d-9aa1-6cbc7daa686a'],
    ['SCH.KSEAB.C10', 'a5934070-8cdb-59cd-a59d-c2d823d81013'],
    ['SCH.TG_BOARD.C8', '70941a24-4775-52b8-a26c-f22e26f396f3'],
    ['SCH.MANIPUR_BOARD.C6.MATHEMATICS', 'f4fb3ab4-23a3-50f6-aa8f-24266f164cd6'],
    ['SCH.TBSE.C2.HEALTH_AND_PHYSICAL_EDUCATION', '2b71d862-f8f2-5eaa-b7ed-58b5e19f6bb7'],
    ['HE.PHARMACY.B_PHARM.SEM_5.INDUSTRIAL_PHARMACY_I', '5e66f61d-211f-5e44-9486-5945b0a95abc'],
    ['HE.COMMERCE_MANAGEMENT.MBA.CORE', '13222d61-2680-5380-905f-380d915d2954'],
    ['ENT.UG.NEET_UG.BIOLOGY.BOTANY.PLANT_GROWTH_AND_DEVELOPMENT', '180f632f-7287-5d43-9763-99bc00a82414'],
    ['ENT.PG.NEET_PG.MICROBIOLOGY', '24fb18e0-b955-53e6-92bc-5c5ad5972105'],
    ['COMP.UPSC.EPFO', 'ffa21103-e670-532d-8b75-f5aeb2d6ab06'],
    ['COMP.SSC.CPO.PAPER_1.ENGLISH_COMPREHENSION.SYNONYMS_AND_ANTONYMS', '22ca92ca-80a6-5819-80b2-119656690d66'],
    ['COMP.BANKING.SBI_CLERK.PRELIMS', '25aa68a4-a6ae-5ee2-acd2-14b5ad23cdd1'],
    ['COMP.RAILWAYS.NTPC.CBT_1.GENERAL_AWARENESS.CURRENT_AFFAIRS', 'f2027fe6-8c92-57b2-b859-4dfbf231b7e2'],
    ['COMP.DEFENCE_POLICE.AGNIVEER.NAVY.SCIENCE.LIFE_SCIENCES', '5cb4bba6-5962-5791-afac-ec8fdc791d1b'],
    ['SCH.CBSE.C11.BIOLOGY', 'd9483e4b-4f52-5c97-9477-10e93f9ebd28'],
    ['ENT.UG.NEET_UG.BIOLOGY', 'f1532362-b967-52dd-81bf-1f3e9ad5f87a'],
];

/**
 * What Book Buddy's own CurriculumService answered for these requests (captured 2026-10-26 from a Book Buddy database
 * holding release 2026.10.1). Vidyaverse's /api/v1/curriculum must answer the same bodies, so the DigiClassroom and
 * PDLMS clients can be the same code as Book Buddy's.
 */
export const BOOK_BUDDY_RESPONSES = JSON.parse(
    readFileSync(join(__dirname, 'book-buddy-responses.json'), 'utf8'),
) as Record<string, unknown>;
