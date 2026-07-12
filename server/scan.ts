import { runSources } from "./pipeline";
import { load, save } from "./store";

async function main() {
  const source = process.argv[2];
  if (process.env.REBUILD_STORE === "true") {
    const store = await load();
    await save({ ...store, cars: [], jobs: [], top5Ids: undefined });
  }
  const statuses = await runSources(source, "cli");
  console.table(
    statuses.map(
      ({ id, discovered, verified, rejected, errors, rejectionReasons }) => ({
        id,
        discovered,
        verified,
        rejected,
        errors: errors.length,
        reasons: JSON.stringify(rejectionReasons || {}),
      }),
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
