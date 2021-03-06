const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require("hardhat");
const { ethers } = require("hardhat");

async function getToken() {
  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken");
  token = await tokenFactory.deploy("a", "a", 18);
  await token.deployed();
  return token;
}

function decimalToUnDecimalStr(num) {
  return new BigNumber(num).times(10 ** 18).toFixed(0);
}

function stringDiv(a, b) {
  let an = new BigNumber(a);
  an = an.minus(an.mod(b));
  return an.div(b).toFixed(0, 3);
}

function stringMul(a, b) {
  let an = new BigNumber(a);
  an = an.times(b);
  return an.toFixed(0, 3);
}

function stringMinus(a, b) {
  let an = new BigNumber(a);
  an = an.minus(b);
  return an.toFixed(0, 3);
}

function stringAdd(a, b) {
  let an = new BigNumber(a);
  an = an.plus(b);
  return an.toFixed(0, 3);
}

function getLockData(slope, MAXTIME, startTime, endTime) {
  const amount = slope * MAXTIME;
  const bias = slope * (endTime - startTime);
  return {
    slope,
    amount,
    bias,
    startTime,
    endTime,
  };
}

function getLastPointAndSlopeChanges(locks, timestamp) {
  let bias = 0;
  let slope = 0;
  const slopeChanges = {};
  for (const lock of locks) {
    // it is assumed that lock.startTime <= timestamp
    if (lock.endTime > timestamp) {
      bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope;
      slope = slope + lock.slope;
      if (slopeChanges[lock.endTime] == undefined) {
        slopeChanges[lock.endTime] = -lock.slope;
      } else {
        slopeChanges[lock.endTime] -= lock.slope;
      }
    }
  }
  return { bias, slope, slopeChanges };
}

async function waitUntilJustBefore(destBlockNumber) {
  let currentBlockNumber = await ethers.provider.getBlockNumber();
  while (currentBlockNumber < destBlockNumber - 1) {
    await ethers.provider.send("evm_mine");
    currentBlockNumber = await ethers.provider.getBlockNumber();
  }
  return currentBlockNumber;
}

async function getStakingStatus(vePUL, nftId) {
  const stakingStatus = await vePUL.stakingStatus(nftId);
  return {
    stakingId: stakingStatus.stakingId.toString(),
    lockAmount: stakingStatus.lockAmount.toString(),
    lastVePUL: stakingStatus.lastVePUL.toString(),
    lastTouchAccRewardPerShare:
      stakingStatus.lastTouchAccRewardPerShare.toString(),
  };
}

async function getStakingInfo(vePUL, tester) {
  const stakingInfo = await vePUL.stakingInfo(tester.address);
  return {
    stakingId: stakingInfo.stakingId.toString(),
    nftId: stakingInfo.nftId.toString(),
    amount: stakingInfo.amount.toString(),
  };
}

async function getRewardInfo(vePUL) {
  const rewardInfo = await vePUL.rewardInfo();
  return {
    provider: rewardInfo.provider,
    accRewardPerShare: rewardInfo.accRewardPerShare.toString(),
    rewardPerBlock: rewardInfo.rewardPerBlock.toString(),
    lastTouchBlock: rewardInfo.lastTouchBlock.toString(),
    startBlock: rewardInfo.startBlock.toString(),
    endBlock: rewardInfo.endBlock.toString(),
  };
}

async function tryCollect(vePUL, PUL, tester) {
  const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
  let ok = true;
  try {
    await vePUL.connect(tester).collect();
  } catch (err) {
    // console.log(err);
    ok = false;
  }
  const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
  return { reward: stringMinus(PULBalanceAfter, PULBalanceBefore), ok };
}

async function tryUnStake(vePUL, PUL, tester) {
  const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
  let ok = true;
  try {
    await vePUL.connect(tester).unStake();
  } catch (err) {
    ok = false;
  }
  const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
  return { reward: stringMinus(PULBalanceAfter, PULBalanceBefore), ok };
}

async function tryModifyEndBlock(vePUL, owner, endBlock) {
  let ok = true;
  try {
    await vePUL.connect(owner).modifyEndBlock(endBlock);
  } catch (err) {
    ok = false;
  }
  return ok;
}

async function tryModifyRewardPerBlock(vePUL, owner, rewardPerBlock) {
  let ok = true;
  try {
    await vePUL.connect(owner).modifyRewardPerBlock(rewardPerBlock);
  } catch (err) {
    ok = false;
  }
  return ok;
}

async function tryModifyStartBlock(vePUL, owner, startBlock) {
  let ok = true;
  try {
    await vePUL.connect(owner).modifyStartBlock(startBlock);
  } catch (err) {
    ok = false;
  }
  return ok;
}

async function tryModifyProvider(vePUL, owner, providerAddress) {
  let ok = true;
  try {
    await vePUL.connect(owner).modifyProvider(providerAddress);
  } catch (err) {
    ok = false;
  }
  return ok;
}

async function waitUntilJustBefore(destBlockNumber) {
  let currentBlockNumber = await ethers.provider.getBlockNumber();
  while (currentBlockNumber < destBlockNumber - 1) {
    await ethers.provider.send("evm_mine");
    currentBlockNumber = await ethers.provider.getBlockNumber();
  }
  return currentBlockNumber;
}

describe("test increase unlock time", function () {
  var signer, tester;
  var PUL;
  var vePUL;

  var timestampStart;
  var rewardPerBlock;

  var q128;

  beforeEach(async function () {
    [signer, provider, provider2, provider3, tester, other, other2] =
      await ethers.getSigners();

    // a fake weth
    const tokenFactory = await ethers.getContractFactory("TestToken");
    PUL = await tokenFactory.deploy("PUL", "PUL", 18);

    const vePULFactory = await ethers.getContractFactory("vePUL");
    rewardPerBlock = "1200000000000000";
    vePUL = await vePULFactory.deploy(PUL.address, {
      provider: provider.address,
      accRewardPerShare: 0,
      rewardPerBlock: rewardPerBlock,
      lastTouchBlock: 0,
      startBlock: 200,
      endBlock: 10000,
    });

    await PUL.connect(tester).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(tester.address, "100000000000000000000");
    await PUL.connect(other).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(other.address, "100000000000000000000");
    await PUL.connect(other2).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(other2.address, "100000000000000000000");
    await PUL.connect(signer).approve(vePUL.address, "100000000000000000000");
    await PUL.mint(signer.address, "100000000000000000000");

    const WEEK = Number((await vePUL.WEEK()).toString());

    const blockNumStart = await ethers.provider.getBlockNumber();
    const blockStart = await ethers.provider.getBlock(blockNumStart);
    timestampStart = blockStart.timestamp;
    if (timestampStart % WEEK !== 0) {
      timestampStart = timestampStart - (timestampStart % WEEK) + WEEK;
    }

    await vePUL
      .connect(tester)
      .createLock("220000000000000000", timestampStart + WEEK * 35);
    await vePUL
      .connect(other)
      .createLock("190000000000000000", timestampStart + WEEK * 35);
    await vePUL
      .connect(tester)
      .createLock("280000000000000000", timestampStart + WEEK * 30);
    await vePUL
      .connect(other)
      .createLock("310000000000000000", timestampStart + WEEK * 30);
    await vePUL
      .connect(other2)
      .createLock("350000000000000000", timestampStart + WEEK * 40);
    await vePUL
      .connect(other2)
      .createLock("360000000000000000", timestampStart + WEEK * 41);
    await vePUL
      .connect(other2)
      .createLock("370000000000000000", timestampStart + WEEK * 42);

    q128 = BigNumber(2).pow(128).toFixed(0);
  });

  it("modify endblock", async function () {
    const okSigner = await tryModifyEndBlock(vePUL, signer, "15000");
    const okTester = await tryModifyEndBlock(vePUL, tester, "16000");

    expect(okSigner).to.equal(true);
    expect(okTester).to.equal(false);
    const rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.endBlock).to.equal("15000");
  });

  it("modify rewardPerBlock", async function () {
    const okSigner = await tryModifyRewardPerBlock(vePUL, signer, "2100000000");
    const okTester = await tryModifyRewardPerBlock(vePUL, tester, "3100000000");

    expect(okSigner).to.equal(true);
    expect(okTester).to.equal(false);
    const rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.rewardPerBlock).to.equal("2100000000");
  });
  it("modify startBlock", async function () {
    let rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("200");

    let currentBlockNumber = await ethers.provider.getBlockNumber();
    console.log("currentBlockNumber: ", currentBlockNumber);
    const okSigner = await tryModifyStartBlock(vePUL, signer, "199");
    const okTester = await tryModifyStartBlock(vePUL, tester, "198");

    expect(okSigner).to.equal(true);
    expect(okTester).to.equal(false);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("199");
    expect(rewardInfo.lastTouchBlock).to.equal("199");

    const okSigner2 = await tryModifyStartBlock(vePUL, signer, "201");
    expect(okSigner2).to.equal(true);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("201");
    expect(rewardInfo.lastTouchBlock).to.equal("201");

    const okSigner3 = await tryModifyStartBlock(vePUL, signer, "50");
    expect(okSigner3).to.equal(false);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("201");
    expect(rewardInfo.lastTouchBlock).to.equal("201");

    const okSigner4 = await tryModifyStartBlock(vePUL, signer, "20000");
    expect(okSigner4).to.equal(false);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("201");
    expect(rewardInfo.lastTouchBlock).to.equal("201");
  });

  it("modify startBlock after start", async function () {
    let rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("200");

    let currentBlockNumber = await ethers.provider.getBlockNumber();
    console.log("currentBlockNumber: ", currentBlockNumber);

    await waitUntilJustBefore(200);
    const okSigner = await tryModifyStartBlock(vePUL, signer, "300");

    expect(okSigner).to.equal(false);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.startBlock).to.equal("200");
  });

  it("modify provider", async function () {
    let rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.provider.toLowerCase()).to.equal(
      provider.address.toLowerCase()
    );

    const okSigner = await tryModifyProvider(vePUL, signer, provider2.address);
    const okTester = await tryModifyProvider(vePUL, tester, provider3.address);

    expect(okSigner).to.equal(true);
    expect(okTester).to.equal(false);
    rewardInfo = await getRewardInfo(vePUL);
    expect(rewardInfo.provider.toLowerCase()).to.equal(
      provider2.address.toLowerCase()
    );
  });
});
