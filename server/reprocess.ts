import { reprocessSavedSnapshots } from "./pipeline";

reprocessSavedSnapshots()
  .then((result) => {
    console.log(result);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
