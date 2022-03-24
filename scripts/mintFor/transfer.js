var Web3 = require("web3");
const secret = require("../../.secret.js");
const BigNumber = require("bignumber.js");
var pk = secret.pk;

const hardhat = require("hardhat");

const deployed = require("../deployed.js");
const config = require("../../hardhat.config.js");
const vePULLib = require("../libraries/vePUL.js");
const path = require("path");
const { string } = require("hardhat/internal/core/params/argumentTypes");
const { assert } = require("console");

const v = process.argv;
const net = process.env.HARDHAT_NETWORK;

const rpc = config.networks[net].url;

var web3 = new Web3(new Web3.providers.HttpProvider(rpc));

const gasPrice = 18000000000;

// Example: HARDHAT_NETWORK='pulsarTest' node transfer.js ${PATH_TO_INPUT_LIST} ${PATH_TO_OUTPUTR_LIST} 18
console.log(v);
console.log(v[4]);
const para = {
  mintListPath: v[2],
  nftListPath: v[3],
  decimal: Number(v[4]),
};
console.log(para);

function getMintList(path, decimal) {
  const fs = require("fs");
  let rawdata = fs.readFileSync(path);
  let data = rawdata.toString().split("\n");
  data = data.map((r) => {
    l = r.split(" ");
    return {
      address: l[0],
      amountDecimal: l[1],
      amount: BigNumber(l[1])
        .times(10 ** decimal)
        .toFixed(0, 3),
      endTime: l[2],
    };
  });
  // console.log(data);
  return data;
}

function isInt(d) {
  if (d.length === 0) {
    return false;
  }
  for (let i = 0; i < d.length; i++) {
    if (d[i] < "0" || d[i] > "9") {
      return false;
    }
  }
  return true;
}

function getNftList(path) {
  const fs = require("fs");
  let rawdata = fs.readFileSync(path);
  const rawDataString = rawdata.toString();
  let data = rawDataString.split("\n");
  const idList = [];
  for (let i = 0; i < data.length; i++) {
    if (isInt(data[i])) {
      idList.push(Number(data[i]));
    }
  }
  return idList;
}

function getMintCalling(vePUL, amount, endTime) {
  return vePUL.methods.createLock(amount, endTime).encodeABI();
}

function getTransferCalling(vePUL, fromAddress, toAddress, nftId) {
  return vePUL.methods
    .safeTransferFrom(fromAddress, toAddress, nftId)
    .encodeABI();
}
//mint uniswap v3 nft
async function main() {
  const [sender] = await hardhat.ethers.getSigners();
  console.log("mintListPath: ", para.mintListPath);
  console.log("nftListPath: ", para.nftListPath);

  const mintList = getMintList(para.mintListPath, para.decimal);
  const nftList = getNftList(para.nftListPath);

  assert(
    mintList.length === nftList.length,
    "nft num should be equal to toAddress num"
  );

  var originSendAddrNum = 0;

  const vePULAddress = deployed[net].vePUL;
  const vePUL = vePULLib.getVePUL(vePULAddress);

  console.log("vePUL addr: ", vePULAddress);

  const mintListLen = mintList.length;
  const mintDelta = 50;
  let sendNumThisTime = 0;
  // var nonce = 42;
  for (
    let mintListStart = originSendAddrNum;
    mintListStart < mintListLen;
    mintListStart += mintDelta
  ) {
    const t1 = new Date().getTime();
    const mintListEnd = Math.min(mintListStart + mintDelta, mintListLen);

    // first, mint
    const callings = [];
    const mintSubList = mintList.slice(mintListStart, mintListEnd);
    const nftSubList = nftList.slice(mintListStart, mintListEnd);

    for (let idx = 0; idx < mintSubList.length; idx++) {
      console.log(
        " -- transfer: ",
        nftSubList[idx],
        " to: ",
        mintSubList[idx].address
      );
      if (
        sender.address.toLowerCase() === mintSubList[idx].address.toLowerCase()
      ) {
        continue;
      }
      const calling = getTransferCalling(
        vePUL,
        sender.address,
        mintSubList[idx].address,
        nftSubList[idx]
      );
      callings.push(calling);
    }
    console.log("callings: ", callings);

    const txData = vePUL.methods.multicall(callings).encodeABI();
    const gas = await vePUL.methods
      .multicall(callings)
      .estimateGas({ from: sender.address });
    // console.log('tx data: ', txData);
    console.log("gas: ", gas);
    const gasLimit = BigNumber(gas * 1.1).toFixed(0, 2);
    console.log("gasLimit: ", gasLimit);
    const signedTx = await web3.eth.accounts.signTransaction(
      {
        // nonce: nonce,
        to: vePULAddress,
        data: txData,
        gas: gasLimit,
        gasPrice: gasPrice,
      },
      pk
    );
    // nonce += 1;

    const txSent = await web3.eth.sendSignedTransaction(
      signedTx.rawTransaction
    );
    console.log("txSent: ", txSent);

    const t2 = new Date().getTime();
    const interval = t2 - t1;
    console.log("interval: ", interval);
  }
}
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
