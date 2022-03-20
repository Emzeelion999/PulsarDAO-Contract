// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/draft-EIP712.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract PulsarDAO is ERC20, EIP712 {
    uint256 public constant MAX_SUPPLY = uint248(1e10 ether);

    // for DAO.
    uint256 public constant AMOUNT_DAO = (MAX_SUPPLY / 100) * 50;
    address public constant ADDR_DAO =
        0x9be86E75E67f2ef9a44730C60cF04Ef9F944CCee;

    // for early contributors.
    uint256 public constant AMOUNT_CONTRIBUTOR = (MAX_SUPPLY / 100) * 15;
    address public constant ADDR_CONTRIBUTOR =
        0x9be86E75E67f2ef9a44730C60cF04Ef9F944CCee;

    // for staking
    uint256 public constant AMOUNT_STAKING = (MAX_SUPPLY / 100) * 5;
    address public constant ADDR_STAKING =
        0x9be86E75E67f2ef9a44730C60cF04Ef9F944CCee;

    // for liquidity providers
    uint256 public constant AMOUNT_LP = (MAX_SUPPLY / 100) * 5;
    address public constant ADDR_LP =
        0x9be86E75E67f2ef9a44730C60cF04Ef9F944CCee;

    // for airdrop
    uint256 public constant AMOUNT_AIREDROP =
        MAX_SUPPLY -
            (AMOUNT_DAO + AMOUNT_CONTRIBUTOR + AMOUNT_STAKING + AMOUNT_LP);

    constructor(
        string memory _name,
        string memory _symbol,
        address _signer
    ) ERC20(_name, _symbol) EIP712("PulsarDAO", "1") {
        _mint(ADDR_DAO, AMOUNT_DAO);
        _mint(ADDR_CONTRIBUTOR, AMOUNT_CONTRIBUTOR);
        _mint(ADDR_STAKING, AMOUNT_STAKING);
        _mint(ADDR_LP, AMOUNT_LP);
        _totalSupply =
            AMOUNT_DAO +
            AMOUNT_CONTRIBUTOR +
            AMOUNT_STAKING +
            AMOUNT_LP;
        cSigner = _signer;
    }

    bytes32 public constant MINT_CALL_HASH_TYPE =
        keccak256("mint(address receiver,uint256 amount)");

    address public immutable cSigner;

    function claim(
        uint256 amountV,
        bytes32 r,
        bytes32 s
    ) external {
        uint256 amount = uint248(amountV);
        uint8 v = uint8(amountV >> 248);
        uint256 total = _totalSupply + amount;
        require(total <= MAX_SUPPLY, "PulsarDAO: Exceed max supply");
        require(minted(msg.sender) == 0, "PulsarDAO: Claimed");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                ECDSA.toTypedDataHash(
                    _domainSeparatorV4(),
                    keccak256(
                        abi.encode(MINT_CALL_HASH_TYPE, msg.sender, amount)
                    )
                )
            )
        );
        require(
            ecrecover(digest, v, r, s) == cSigner,
            "PulsarDAO: Invalid signer"
        );
        _totalSupply = total;
        _mint(msg.sender, amount);
    }
}
