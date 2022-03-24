
const { BigNumber } = require("bignumber.js");
const { expect } = require("chai");
const hardhat = require('hardhat');
const { ethers } = require("hardhat");;

async function getToken() {

  // deploy token
  const tokenFactory = await ethers.getContractFactory("TestToken")
  token = await tokenFactory.deploy('a', 'a', 18);
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
            bias = bias + lock.bias - (timestamp - lock.startTime) * lock.slope
            slope = slope + lock.slope;
            if (slopeChanges[lock.endTime] == undefined) {
                slopeChanges[lock.endTime] = -lock.slope;
            } else {
                slopeChanges[lock.endTime] -= lock.slope;
            }
        }
    }
    return {bias, slope, slopeChanges};
}

async function waitUntilJustBefore(destBlockNumber) {
    let currentBlockNumber = await ethers.provider.getBlockNumber();
    while (currentBlockNumber < destBlockNumber - 1) {
        await ethers.provider.send('evm_mine');
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
        lastTouchAccRewardPerShare: stakingStatus.lastTouchAccRewardPerShare.toString(),
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
        endBlock: rewardInfo.endBlock.toString()
    }
}

async function tryCollect(vePUL, PUL, tester) {
    const PULBalanceBefore = (await PUL.balanceOf(tester.address)).toString();
    await vePUL.connect(tester).collect();
    const PULBalanceAfter = (await PUL.balanceOf(tester.address)).toString();
    return stringMinus(PULBalanceAfter, PULBalanceBefore);
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
        await ethers.provider.send('evm_mine');
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

    beforeEach(async function() {
      
        [signer, provider, provider2, provider3, tester, other, other2] = await ethers.getSigners();

        // a fake weth
        const tokenFactory = await ethers.getContractFactory("TestToken");
        PUL = await tokenFactory.deploy('PUL', 'PUL', 18);

        
        const vePULFactory = await ethers.getContractFactory("vePUL");
        rewardPerBlock = '1200000000000000';
        vePUL = await vePULFactory.deploy(PUL.address, {
            provider: provider.address,
            accRewardPerShare: 0,
            rewardPerBlock: rewardPerBlock,
            lastTouchBlock: 0,
            startBlock: 70,
            endBlock: 10000
        });

        await PUL.connect(tester).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(tester.address, '100000000000000000000');
        await PUL.connect(other).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(other.address, '100000000000000000000');
        await PUL.connect(other2).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(other2.address, '100000000000000000000');
        await PUL.connect(provider).approve(vePUL.address, '100000000000000000000');
        await PUL.mint(provider.address, '100000000000000000000');

        const WEEK = Number((await vePUL.WEEK()).toString());

    
        const blockNumStart = await ethers.provider.getBlockNumber();
        const blockStart = await ethers.provider.getBlock(blockNumStart);
        timestampStart = blockStart.timestamp;
        if (timestampStart % WEEK !== 0) {
            timestampStart = timestampStart - timestampStart % WEEK + WEEK;
        }

        await vePUL.connect(tester).createLock('220000000000000000', timestampStart + WEEK * 35);
        await vePUL.connect(other).createLock('190000000000000000', timestampStart + WEEK * 35);
        await vePUL.connect(tester).createLock('280000000000000000', timestampStart + WEEK * 30);
        await vePUL.connect(other).createLock('310000000000000000', timestampStart + WEEK * 30);
        await vePUL.connect(other2).createLock('350000000000000000', timestampStart + WEEK * 40);
        await vePUL.connect(other2).createLock('360000000000000000', timestampStart + WEEK * 41);
        await vePUL.connect(other2).createLock('370000000000000000', timestampStart + WEEK * 42);

        q128 = BigNumber(2).pow(128).toFixed(0);
    });

    it("modify rewardPerBlock", async function () {
        const WEEK = Number((await vePUL.WEEK()).toString());
        const MAXTIME = Number((await vePUL.MAXTIME()).toString());

        console.log('week: ', WEEK);
        console.log('max time: ', MAXTIME);
        const rewardPerBlock2 = '50000000000';
        
        // phase1
        await waitUntilJustBefore(80);
        const startTime1 = timestampStart + Math.round(WEEK * 5.2);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime1]);

        await vePUL.connect(tester).stake('1');
        const remainTime1 = String(timestampStart + WEEK * 35 - startTime1);
        const slope = stringDiv('220000000000000000', MAXTIME);
        const stakingStatus1 = await getStakingStatus(vePUL, '1');
        const stakePULAmount = (await vePUL.stakePULAmount()).toString();
        expect(stakePULAmount).to.equal('220000000000000000');
        const lastVePUL1 = stringMul(slope, remainTime1);
        expect(lastVePUL1).to.equal(stakingStatus1.lastVePUL);
        const globalAcc1 = '0';
        const rewardInfo1 = await getRewardInfo(vePUL);
        expect(rewardInfo1.accRewardPerShare).to.equal(globalAcc1);
        
        // phase2
        await waitUntilJustBefore(90);
        const startTime2 = timestampStart + Math.round(WEEK * 6.1);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime2]);

        const reward2 = await tryCollect(vePUL, PUL, tester);
        const remainTime2 = String(timestampStart + WEEK * 35 - startTime2);
        const stakingStatus2 = await getStakingStatus(vePUL, '1');
        const lastVePUL2 = stringMul(slope, remainTime2);
        expect(lastVePUL2).to.equal(stakingStatus2.lastVePUL);
        const deltaGlobalAcc2 = stringDiv(stringMul(stringMul(rewardPerBlock, '10'), q128), stakePULAmount);
        const rewardInfo2 = await getRewardInfo(vePUL);
        console.log('delta globalacc2: ', deltaGlobalAcc2);
        console.log(rewardInfo2.accRewardPerShare);
        expect(reward2).to.equal(stringDiv(stringMul(lastVePUL1, deltaGlobalAcc2), q128));


        // phase2
        await waitUntilJustBefore(100);
        const startTime3 = timestampStart + Math.round(WEEK * 7.9);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime3]);
        await tryModifyRewardPerBlock(vePUL, signer, rewardPerBlock2);

        const deltaGlobalAcc3 = stringDiv(stringMul(stringMul(rewardPerBlock, '10'), q128), stakePULAmount);

        // phase3
        await waitUntilJustBefore(110);
        const startTime4 = timestampStart + Math.round(WEEK * 8);
        await ethers.provider.send('evm_setNextBlockTimestamp', [startTime4]);
        const reward4 = await tryCollect(vePUL, PUL, tester);

        const remainTime4 = String(timestampStart + WEEK * 35 - startTime4);
        const stakingStatus4 = await getStakingStatus(vePUL, '1');
        const lastVePUL4 = stringMul(slope, remainTime4);
        expect(lastVePUL4).to.equal(stakingStatus4.lastVePUL);
        const deltaGlobalAcc4 = stringDiv(stringMul(stringMul(rewardPerBlock2, '10'), q128), stakePULAmount);

        const expectReward4 = stringDiv(stringMul(stringAdd(deltaGlobalAcc3, deltaGlobalAcc4), lastVePUL2), q128);
        expect(reward4).to.equal(expectReward4);
    });

});