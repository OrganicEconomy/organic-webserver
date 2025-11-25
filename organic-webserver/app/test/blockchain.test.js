import { equal } from "assert";

import { CitizenBlockchain } from "organic-money";
import {} from "../app/services/blockchain.service.js"

const sk = "ed945716dddb7af2c9774939e9946f1fee31f5ec0a3c6ec96059f119c396912f"

describe("validateBlockchain", function () {
    it("should return a valid blockchain", () => {
        const bc = new CitizenBlockchain()

        bc.makeBirthBlock(sk, Date.today(), "Alice")
      equal([1, 2, 3].indexOf(4), -1);
    });
});
