const hardhat = require("hardhat");
const contracts = require("./deployed.js");
const BigNumber = require("bignumber.js");

// example
// HARDHAT_NETWORK='pulsarTest' \
//     node deployVePUL.js 0xD4D6F030520649c7375c492D37ceb56571f768D0 0.1 18 14909 20000
const v = process.argv
const net = process.env.HARDHAT_NETWORK


var para = {
    rewardProvider: v[2],
    rewardPerBlockDecimal: v[3],
    rewardTokenDecimal: v[4],
    startBlock: v[5],
    endBlock: v[6],
}


async function main() {
    
  const [deployer] = await hardhat.ethers.getSigners();

  const vePULFactory = await hardhat.ethers.getContractFactory("vePUL");

  console.log("Paramters: ");
  for ( var i in para) { console.log("    " + i + ": " + para[i]); }

  console.log("Deploying .....");

  var PUL = contracts[net].PUL;

  console.log('PUL: ', PUL);

  const rewardPerBlockNoDecimal = BigNumber(para.rewardPerBlockDecimal).times(10 ** Number(para.rewardTokenDecimal)).toFixed(0);

  const args = [
    PUL, 
    {
      provider: para.rewardProvider,
      accRewardPerShare: 0,
      rewardPerBlock: rewardPerBlockNoDecimal,
      lastTouchBlock: 0,
      startBlock: para.startBlock,
      endBlock: para.endBlock,
    }
  ]

  console.log('args: ', args);

  // const vePUL = await vePULFactory.deploy(...args);
  // await vePUL.deployed();

  // console.log("vePUL2 Contract Address: " , vePUL.address);

}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });